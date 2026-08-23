#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { AgentTapeAccessError, inspectWorkspaceTape, listWorkspaceTapes } from "./tape-access.mjs";
import { forkWorkspaceRun, saveWorkspaceRegression } from "./write-tools.mjs";

const confidenceLevel = z.enum(["high", "medium", "low", "playback_only"]);
const failureSchema = z.object({
  sequence: z.number().int().positive(),
  toolName: z.string(),
  kind: z.string(),
  reason: z.string(),
});
const confidenceSummarySchema = z.object({
  score: z.number().min(0).max(1),
  level: confidenceLevel,
}).nullable();
const tapeSummarySchema = z.object({
  id: z.string(),
  status: z.enum(["captured", "failed", "passed"]),
  capturedAt: z.string(),
  completedAt: z.string(),
  eventCount: z.number().int().nonnegative(),
  toolCallCount: z.number().int().nonnegative(),
  failedToolCallCount: z.number().int().nonnegative(),
  firstFailure: failureSchema.optional(),
  replayConfidence: confidenceSummarySchema,
  redactionApplied: z.boolean(),
});
const eventSchema = z.object({
  sequence: z.number().int().positive(),
  recordedAt: z.string(),
  type: z.string(),
  turnId: z.string().optional(),
  permissionMode: z.string().optional(),
  tool: z.object({
    name: z.string(),
    useId: z.string().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    failed: z.boolean().optional(),
    failure: z.object({ kind: z.string(), reason: z.string() }).optional(),
  }).optional(),
  details: z.unknown().optional(),
});
const injectionKindSchema = z.enum(["permission_denied", "timeout", "rate_limited", "malformed_json", "truncated_response"]);
const assertionInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("field_equals"), path: z.string().regex(/^\//), expected: z.unknown() }),
  z.object({ kind: z.literal("tool_present"), toolName: z.string().min(1) }),
  z.object({ kind: z.literal("tool_absent"), toolName: z.string().min(1) }),
  z.object({ kind: z.literal("tool_order"), firstTool: z.string().min(1), secondTool: z.string().min(1) }),
  z.object({ kind: z.literal("max_retries"), maximum: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("final_status"), expected: z.enum(["captured", "failed", "passed"]) }),
  z.object({ kind: z.literal("min_replay_confidence"), minimum: z.number().min(0).max(1) }),
]);
const branchRequestSchema = {
  id: z.string().regex(/^tape_[A-Za-z0-9._-]+$/),
  workspaceRoot: z.string().min(1).optional().describe("Absolute active Codex workspace path when the host cannot expose it automatically."),
  boundarySequence: z.number().int().positive(),
  targetSequence: z.number().int().positive().optional(),
  injection: injectionKindSchema,
  timeoutMs: z.number().int().min(1).max(300_000).optional(),
  maxBytes: z.number().int().min(1).max(1_048_576).optional(),
  retryAfterSeconds: z.number().int().min(1).max(86_400).optional(),
};
const branchResultSchema = {
  sourceTapeId: z.string(),
  status: z.enum(["completed", "playback_only"]),
  mode: z.literal("structural").optional(),
  reason: z.string().optional(),
  finalStatus: z.enum(["captured", "failed", "passed"]).optional(),
  branch: z.unknown().optional(),
  diff: z.unknown().optional(),
  confidence: z.unknown().optional(),
  evidence: z.object({
    replayedEventCount: z.number().int().nonnegative(),
    modelCallsBeforeFork: z.number().int().nonnegative(),
    liveToolCalls: z.number().int().nonnegative(),
  }),
  limitations: z.array(z.string()).optional(),
};

function toolError(error) {
  const code = error instanceof AgentTapeAccessError ? error.code : "AGENTTAPE_READ_FAILED";
  const message = error instanceof AgentTapeAccessError ? error.message : "AgentTape could not read workspace captures.";
  return {
    isError: true,
    content: [{ type: "text", text: `${code}: ${message}` }],
  };
}

async function activeWorkspaceRoot(configuredRoot, requestedRoot, extra, server) {
  if (configuredRoot) return configuredRoot;
  if (requestedRoot != null) {
    if (!path.isAbsolute(requestedRoot)) {
      throw new AgentTapeAccessError("INVALID_WORKSPACE_ROOT", "workspaceRoot must be an absolute path.");
    }
    return requestedRoot;
  }
  const codexCwd = extra?._meta?.codex_cwd;
  if (typeof codexCwd === "string" && path.isAbsolute(codexCwd)) return codexCwd;

  if (server.server.getClientCapabilities()?.roots) {
    const result = await server.server.listRoots();
    const workspace = result.roots.find((root) => root.uri.startsWith("file:"));
    if (workspace) return fileURLToPath(workspace.uri);
  }
  for (const candidate of [process.env.CODEX_CWD, process.env.PWD]) {
    if (typeof candidate === "string" && path.isAbsolute(candidate)) return candidate;
  }
  return process.cwd();
}

export function createAgentTapeServer({ workspaceRoot } = {}) {
  const server = new McpServer(
    { name: "agenttape", version: "0.3.1" },
    {
      instructions: "Read AgentTape captures from the active workspace. The server resolves the workspace from MCP roots or the Codex environment; pass workspaceRoot only when the host cannot expose it. Inspect a tape before making claims about failures or replay confidence. Hosted tools outside local hook coverage may be absent.",
    },
  );

  server.registerTool(
    "list_tapes",
    {
      title: "List AgentTape captures",
      description: "List valid AgentTape captures in the active workspace with failure, redaction, and replay-confidence summaries.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(50),
        workspaceRoot: z.string().min(1).optional().describe("Absolute active Codex workspace path when the host cannot expose it automatically."),
      },
      outputSchema: {
        tapes: z.array(tapeSummarySchema),
        warnings: z.array(z.object({ file: z.string(), code: z.string() })),
        truncated: z.boolean(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ limit, workspaceRoot: requestedRoot }, extra) => {
      try {
        const root = await activeWorkspaceRoot(workspaceRoot, requestedRoot, extra, server);
        const structuredContent = await listWorkspaceTapes(root, limit);
        return {
          structuredContent,
          content: [{ type: "text", text: `Found ${structuredContent.tapes.length} valid AgentTape capture(s).` }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "inspect_tape",
    {
      title: "Inspect an AgentTape capture",
      description: "Inspect one workspace tape by stable ID, including run metadata, events, failures, redaction state, and replay confidence.",
      inputSchema: {
        id: z.string().regex(/^tape_[A-Za-z0-9._-]+$/),
        workspaceRoot: z.string().min(1).optional().describe("Absolute active Codex workspace path when the host cannot expose it automatically."),
      },
      outputSchema: {
        run: z.object({
          id: z.string(),
          status: z.enum(["captured", "failed", "passed"]),
          capturedAt: z.string(),
          completedAt: z.string(),
          source: z.object({
            adapter: z.string(),
            sessionId: z.string(),
            turnId: z.string().optional(),
            coverage: z.enum(["complete", "supported-local-hooks", "partial", "unknown"]),
          }),
          summary: z.object({
            eventCount: z.number().int().nonnegative(),
            toolCallCount: z.number().int().nonnegative(),
            failedToolCallCount: z.number().int().nonnegative(),
            firstFailureSequence: z.number().int().positive().optional(),
          }),
          limitations: z.array(z.string()),
          artifactCount: z.number().int().nonnegative(),
          assertionCount: z.number().int().nonnegative(),
          fork: z.unknown().nullable(),
          injection: z.unknown().nullable(),
        }),
        events: z.array(eventSchema),
        failures: z.array(failureSchema),
        replayConfidence: z.unknown().nullable(),
        redaction: z.object({
          applied: z.boolean(),
          count: z.number().int().nonnegative(),
          strategy: z.string(),
          paths: z.array(z.string()),
        }),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, workspaceRoot: requestedRoot }, extra) => {
      try {
        const root = await activeWorkspaceRoot(workspaceRoot, requestedRoot, extra, server);
        const structuredContent = await inspectWorkspaceTape(root, id);
        return {
          structuredContent,
          content: [{
            type: "text",
            text: `${structuredContent.run.id} is ${structuredContent.run.status} with ${structuredContent.failures.length} recorded failure(s).`,
          }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "fork_run",
    {
      title: "Fork an AgentTape run",
      description: "Create a deterministic structural branch at a recorded event boundary using one supported result injection. This never calls a live tool or model.",
      inputSchema: branchRequestSchema,
      outputSchema: branchResultSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (options, extra) => {
      try {
        const root = await activeWorkspaceRoot(workspaceRoot, options.workspaceRoot, extra, server);
        const replay = await forkWorkspaceRun(root, options);
        const structuredContent = {
          sourceTapeId: replay.sourceTapeId,
          status: replay.status,
          ...(replay.mode ? { mode: replay.mode } : {}),
          ...(replay.reason ? { reason: replay.reason } : {}),
          ...(replay.finalStatus ? { finalStatus: replay.finalStatus } : {}),
          ...(replay.branch ? { branch: replay.branch } : {}),
          ...(replay.diff ? { diff: replay.diff } : {}),
          ...(replay.confidence ? { confidence: replay.confidence } : {}),
          evidence: replay.evidence,
          ...(replay.limitations ? { limitations: replay.limitations } : {}),
        };
        return {
          structuredContent,
          content: [{
            type: "text",
            text: replay.status === "completed"
              ? `Created ${replay.branch.id} with 0 model calls before the fork.`
              : `Playback only: ${replay.reason}`,
          }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "save_regression",
    {
      title: "Save an AgentTape regression",
      description: "Save a validated structural branch as an executable regression .tape under tests/agenttape in the active workspace.",
      inputSchema: {
        ...branchRequestSchema,
        assertions: z.array(assertionInputSchema).min(1).max(50).optional(),
        filename: z.string().regex(/^[A-Za-z0-9._-]+\.tape$/).optional(),
        overwrite: z.boolean().default(false),
      },
      outputSchema: {
        path: z.string(),
        tapeId: z.string(),
        branchId: z.string(),
        assertionCount: z.number().int().positive(),
        replayConfidence: confidenceSummarySchema.unwrap(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (options, extra) => {
      try {
        const root = await activeWorkspaceRoot(workspaceRoot, options.workspaceRoot, extra, server);
        const structuredContent = await saveWorkspaceRegression(root, options);
        return {
          structuredContent,
          content: [{ type: "text", text: `Saved executable regression to ${structuredContent.path}.` }],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

export async function startStdioServer() {
  const server = createAgentTapeServer();
  await server.connect(new StdioServerTransport());
}

startStdioServer().catch(() => {
  process.stderr.write("AgentTape MCP server failed to start.\n");
  process.exitCode = 1;
});
