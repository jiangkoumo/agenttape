import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod-v4";

import {
  forkRemoteTape,
  inspectRemoteTape,
  remoteToolError,
  runRemoteAssertions,
  validateRemoteTape,
} from "./remote-tools.mjs";

const tapeDocumentSchema = z.record(z.string(), z.unknown()).describe(
  "A complete redacted AgentTape version 1 JSON document. redactions.applied must be true and the encoded document must not exceed 1 MiB.",
);
const tapeInputSchema = z.object({ tape: tapeDocumentSchema });
const injectionKindSchema = z.enum(["permission_denied", "timeout", "rate_limited", "malformed_json", "truncated_response"]);
const forkInputSchema = z.object({
  tape: tapeDocumentSchema,
  boundarySequence: z.number().int().positive(),
  targetSequence: z.number().int().positive().optional(),
  injection: z.object({
    kind: injectionKindSchema,
    parameters: z.object({
      timeoutMs: z.number().int().min(1).max(300_000).optional(),
      maxBytes: z.number().int().min(1).max(1_048_576).optional(),
      retryAfterSeconds: z.number().int().min(1).max(86_400).optional(),
    }).optional(),
  }),
});

const safeAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

function registerTool(server, name, config, handler, successText) {
  server.registerTool(name, { ...config, annotations: safeAnnotations }, async (input) => {
    try {
      const structuredContent = handler(input);
      return {
        structuredContent,
        content: [{ type: "text", text: successText(structuredContent) }],
      };
    } catch (error) {
      return remoteToolError(error);
    }
  });
}

export function createRemoteAgentTapeServer() {
  const server = new McpServer(
    { name: "agenttape-remote", version: "0.3.1" },
    {
      instructions: "Process only a redacted AgentTape v1 document explicitly supplied by the caller. This stateless server does not read local files, retain tapes, call models, or call live tools. Structural replay stops at the injected tool result.",
    },
  );

  registerTool(
    server,
    "validate_tape",
    {
      title: "Validate a redacted tape",
      description: "Validate the format, replay confidence, size, and explicit redaction state of a caller-supplied AgentTape v1 document.",
      inputSchema: tapeInputSchema,
      outputSchema: z.object({
        valid: z.literal(true),
        id: z.string(),
        version: z.literal(1),
        status: z.enum(["captured", "failed", "passed"]),
        eventCount: z.number().int().nonnegative(),
        redactionApplied: z.literal(true),
        replayConfidence: z.object({ score: z.number(), level: z.string() }).nullable(),
      }),
    },
    ({ tape }) => validateRemoteTape(tape),
    (result) => `${result.id} is a valid redacted AgentTape v1 document with ${result.eventCount} event(s).`,
  );

  registerTool(
    server,
    "inspect_tape",
    {
      title: "Inspect supplied failure evidence",
      description: "Summarize run metadata, event types, recorded failures, redaction, and replay confidence without echoing every captured value.",
      inputSchema: tapeInputSchema,
      outputSchema: z.object({
        run: z.record(z.string(), z.unknown()),
        eventTypes: z.record(z.string(), z.number().int().nonnegative()),
        failures: z.array(z.record(z.string(), z.unknown())),
        replayConfidence: z.unknown().nullable(),
        redaction: z.record(z.string(), z.unknown()),
      }),
    },
    ({ tape }) => inspectRemoteTape(tape),
    (result) => `${result.run.id} contains ${result.failures.length} recorded failure(s).`,
  );

  registerTool(
    server,
    "fork_run",
    {
      title: "Create a structural failure branch",
      description: "Deterministically substitute one recorded tool result after a chosen event boundary. This performs zero model calls and zero live tool calls.",
      inputSchema: forkInputSchema,
      outputSchema: z.object({
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
          modelCallsBeforeFork: z.literal(0),
          liveToolCalls: z.literal(0),
        }),
        limitations: z.array(z.string()).optional(),
      }),
    },
    ({ tape, ...options }) => forkRemoteTape(tape, options),
    (result) => result.status === "completed"
      ? `Created ${result.branch.id} with 0 model calls and 0 live tool calls.`
      : `Playback only: ${result.reason}`,
  );

  registerTool(
    server,
    "run_assertions",
    {
      title: "Run tape regression assertions",
      description: "Execute the assertions embedded in a caller-supplied regression tape using offline structural replay, without returning compared captured values.",
      inputSchema: tapeInputSchema,
      outputSchema: z.object({
        tapeId: z.string(),
        passed: z.boolean(),
        error: z.object({ code: z.string(), message: z.string() }).optional(),
        summary: z.object({ total: z.number(), passed: z.number(), failed: z.number() }).optional(),
        assertions: z.array(z.object({ index: z.number(), kind: z.string(), passed: z.boolean(), message: z.string() })),
        evidence: z.object({
          replayedEventCount: z.number().int().nonnegative(),
          modelCallsBeforeFork: z.literal(0),
          liveToolCalls: z.literal(0),
        }).nullable(),
      }),
    },
    ({ tape }) => runRemoteAssertions(tape),
    (result) => result.passed
      ? `PASS ${result.tapeId}: ${result.summary.passed}/${result.summary.total} assertions.`
      : `FAIL ${result.tapeId}: ${result.summary ? result.summary.failed : 0} assertion(s) failed.`,
  );

  return server;
}
