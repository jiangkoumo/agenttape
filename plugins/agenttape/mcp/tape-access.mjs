import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { parseTape } from "../scripts/tape-schema.mjs";

export const MAX_TAPE_BYTES = 1_048_576;
export const MAX_LIST_RESULTS = 100;

export class AgentTapeAccessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentTapeAccessError";
    this.code = code;
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function containsRedaction(value, depth = 0) {
  if (depth > 10 || value == null) return false;
  if (typeof value === "string") return value.includes("[REDACTED]");
  if (Array.isArray(value)) return value.some((item) => containsRedaction(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.values(value).some((item) => containsRedaction(item, depth + 1));
}

function replayConfidence(tape) {
  const confidence = tape.replay?.confidence;
  return confidence ? { score: confidence.score, level: confidence.level } : null;
}

function firstFailure(tape) {
  const event = tape.events.find((item) => item.tool?.failed);
  if (!event) return undefined;
  return {
    sequence: event.sequence,
    toolName: event.tool.name,
    kind: event.tool.failure?.kind || "tool_error",
    reason: event.tool.failure?.reason || "Recorded tool failure",
  };
}

export function summarizeTape(tape) {
  return {
    id: tape.id,
    status: tape.status,
    capturedAt: tape.capturedAt,
    completedAt: tape.completedAt,
    eventCount: tape.summary.eventCount,
    toolCallCount: tape.summary.toolCallCount,
    failedToolCallCount: tape.summary.failedToolCallCount,
    ...(firstFailure(tape) ? { firstFailure: firstFailure(tape) } : {}),
    replayConfidence: replayConfidence(tape),
    redactionApplied: tape.redactions?.applied === true || containsRedaction(tape),
  };
}

async function secureTapeDirectory(workspaceRoot) {
  const workspace = await realpath(path.resolve(workspaceRoot));
  const requested = path.join(workspace, ".agent-tape", "tapes");
  let directory;
  try {
    directory = await realpath(requested);
  } catch (error) {
    if (error.code === "ENOENT") return { workspace, directory: null };
    throw error;
  }
  if (!isInside(workspace, directory)) {
    throw new AgentTapeAccessError("PATH_OUTSIDE_WORKSPACE", "The AgentTape directory resolves outside the workspace.");
  }
  return { workspace, directory };
}

async function readEntries(workspaceRoot) {
  const { directory } = await secureTapeDirectory(workspaceRoot);
  if (!directory) return { entries: [], warnings: [] };

  const dirents = await readdir(directory, { withFileTypes: true });
  const entries = [];
  const warnings = [];

  for (const dirent of dirents) {
    if (!dirent.name.endsWith(".tape")) continue;
    if (!dirent.isFile()) {
      warnings.push({ file: dirent.name, code: "UNSAFE_FILE_TYPE" });
      continue;
    }

    const file = path.join(directory, dirent.name);
    const [resolved, metadata] = await Promise.all([realpath(file), lstat(file)]);
    if (!isInside(directory, resolved) || metadata.isSymbolicLink()) {
      warnings.push({ file: dirent.name, code: "PATH_OUTSIDE_WORKSPACE" });
      continue;
    }
    if (metadata.size > MAX_TAPE_BYTES) {
      warnings.push({ file: dirent.name, code: "TAPE_TOO_LARGE" });
      continue;
    }

    try {
      const tape = parseTape(await readFile(resolved, "utf8"));
      entries.push({ tape, modifiedAt: metadata.mtimeMs });
    } catch (error) {
      warnings.push({ file: dirent.name, code: error.code || "INVALID_TAPE" });
    }
  }

  entries.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return { entries, warnings };
}

export async function listWorkspaceTapes(workspaceRoot, limit = 50) {
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_LIST_RESULTS);
  const { entries, warnings } = await readEntries(workspaceRoot);
  return {
    tapes: entries.slice(0, boundedLimit).map(({ tape }) => summarizeTape(tape)),
    warnings,
    truncated: entries.length > boundedLimit,
  };
}

export async function inspectWorkspaceTape(workspaceRoot, id) {
  const tape = await loadWorkspaceTape(workspaceRoot, id);
  return inspectTape(tape);
}

export function inspectTape(tape) {
  const failures = tape.events.filter((event) => event.tool?.failed).map((event) => ({
    sequence: event.sequence,
    toolName: event.tool.name,
    kind: event.tool.failure?.kind || "tool_error",
    reason: event.tool.failure?.reason || "Recorded tool failure",
  }));

  return {
    run: {
      id: tape.id,
      status: tape.status,
      capturedAt: tape.capturedAt,
      completedAt: tape.completedAt,
      source: {
        adapter: tape.source.adapter,
        sessionId: tape.source.sessionId,
        ...(tape.source.turnId ? { turnId: tape.source.turnId } : {}),
        coverage: tape.source.coverage,
      },
      summary: tape.summary,
      limitations: tape.limitations,
      artifactCount: tape.artifacts?.length || 0,
      assertionCount: tape.assertions?.length || 0,
      fork: tape.fork || null,
      injection: tape.injection || null,
    },
    events: tape.events,
    failures,
    replayConfidence: tape.replay?.confidence || null,
    redaction: tape.redactions || {
      applied: containsRedaction(tape),
      count: 0,
      strategy: "agenttape-v1",
      paths: [],
    },
  };
}

export async function loadWorkspaceTape(workspaceRoot, id) {
  const { entries } = await readEntries(workspaceRoot);
  const matches = entries.filter((entry) => entry.tape.id === id);
  if (!matches.length) {
    throw new AgentTapeAccessError("TAPE_NOT_FOUND", "No valid tape with that ID exists in this workspace.");
  }
  if (matches.length > 1) {
    throw new AgentTapeAccessError("TAPE_ID_COLLISION", "Multiple tapes use the requested ID.");
  }
  return matches[0].tape;
}
