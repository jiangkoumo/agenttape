import { createHash } from "node:crypto";
import { appendFile, mkdir, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export const TAPE_VERSION = 1;

const SECRET_KEY = /(?:authorization|cookie|credential|password|secret|token|api[-_]?key)/i;
const FAILURE_STATUS = /^(?:denied|error|failed|failure|forbidden|cancelled|canceled|timeout|timed_out|timed-out)$/i;
const MAX_STRING_LENGTH = 32_768;
const MAX_ARRAY_LENGTH = 100;
const MAX_DEPTH = 8;
const LOCK_RETRY_COUNT = 250;
const LOCK_RETRY_DELAY_MS = 10;
const STALE_LOCK_MS = 30_000;
const MAX_TRANSCRIPT_TAIL_BYTES = 4 * 1024 * 1024;
const EVENT_DETAIL_OMISSIONS = new Set([
  "session_id",
  "transcript_path",
  "cwd",
  "hook_event_name",
  "model",
  "turn_id",
  "permission_mode",
  "tool_name",
  "tool_use_id",
  "tool_input",
  "tool_response",
  "agent_transcript_path",
]);

function redactString(value) {
  const truncated = value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…[TRUNCATED]`
    : value;

  return truncated
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/((?:api[-_]?key|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

export function redact(value, depth = 0) {
  if (depth > MAX_DEPTH) return "[TRUNCATED_DEPTH]";
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_LENGTH).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY_LENGTH) items.push(`[TRUNCATED_${value.length - MAX_ARRAY_LENGTH}_ITEMS]`);
    return items;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1),
    ]),
  );
}

function hasFailureSignal(value) {
  if (value == null) return false;
  if (typeof value === "string") {
    return /\b(?:permission denied|access denied|not authorized|process exited with code [1-9]\d*|exit status [1-9]\d*)\b/i.test(value);
  }
  if (Array.isArray(value) || typeof value !== "object") return false;

  for (const [key, item] of Object.entries(value)) {
    if (/^(?:is_error|isError)$/i.test(key) && item === true) return true;
    if (/^(?:success|ok)$/i.test(key) && item === false) return true;
    if (/^(?:exit_code|exitCode)$/i.test(key) && item != null && Number.isFinite(Number(item)) && Number(item) !== 0) return true;
    if (/^(?:status_code|statusCode)$/i.test(key) && item != null && Number.isFinite(Number(item)) && Number(item) >= 400) return true;
    if (/^(?:status|state)$/i.test(key) && typeof item === "string" && FAILURE_STATUS.test(item)) return true;
  }

  return false;
}

function transcriptDiagnosticText(item) {
  let text;
  try {
    text = JSON.stringify({
      status: item.status,
      errorCode: item.error_code ?? item.errorCode,
      errorMessage: item.error_message ?? item.errorMessage,
      message: item.message,
      error: item.error,
      result: item.result?.isError === true || item.result?.is_error === true ? item.result : undefined,
    });
  } catch {
    return undefined;
  }
  return text;
}

function classifyTranscriptFailure(item) {
  const status = typeof item.status === "string" ? item.status.trim().toLowerCase() : "";
  if (/^(?:timeout|timed_out|timed-out)$/.test(status)) {
    return {
      kind: "timeout",
      reason: "Codex recorded a tool timeout.",
    };
  }
  if (/^(?:denied|forbidden)$/.test(status)) {
    return {
      kind: "permission_denied",
      reason: "Codex recorded that policy denied the tool operation.",
    };
  }

  const text = transcriptDiagnosticText(item);
  if (/(?:\b(?:time[ -]?out|timed[ -]?out|deadline[ _-]?exceeded|ETIMEDOUT)\b|超时|超時)/i.test(text || "")) {
    return {
      kind: "timeout",
      reason: "The recorded approval request timed out.",
    };
  }
  if (/(?:\b(?:permission|access|authorization|policy|rule|tool(?:\s+call)?|operation)\s+(?:was |is )?denied\b|\b(?:toolfence|policy(?:\s+engine)?|sandbox)\s+denied\b|\bdenied\s+(?:by|due to)\s+(?:policy|rule)\b|\bdenied this tool call\b|\bnot authorized\b|\bforbidden\b|权限(?:不足|被拒绝)|策略拒绝|拒绝执行)/i.test(text || "")) {
    return {
      kind: "permission_denied",
      reason: "Codex recorded that policy denied the tool operation.",
    };
  }
  return undefined;
}

function hasTranscriptFailure(item, status, exitCode) {
  if ((exitCode !== undefined && exitCode !== 0) || FAILURE_STATUS.test(status || "")) return true;
  return item.result?.isError === true || item.result?.is_error === true;
}

function safeSegment(value, fallback) {
  const normalized = String(value || fallback).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  return normalized || fallback;
}

function captureRoot(cwd) {
  return path.join(path.resolve(cwd || process.cwd()), ".agent-tape");
}

function portableCwd(cwd) {
  const resolved = path.resolve(cwd || process.cwd());
  const home = os.homedir();
  if (resolved === home) return "~";
  if (resolved.startsWith(`${home}${path.sep}`)) {
    return `~/${path.relative(home, resolved).split(path.sep).join("/")}`;
  }
  return resolved;
}

function runtimePath(payload) {
  const session = safeSegment(payload.session_id, "unknown-session");
  return path.join(captureRoot(payload.cwd), "runtime", `${session}.jsonl`);
}

async function readEvents(file) {
  try {
    const content = await readFile(file, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function resolveTranscriptPath(payload) {
  if (payload.transcript_path) return payload.transcript_path;
  if (!payload.session_id) return undefined;

  const sessionSuffix = `-${safeSegment(payload.session_id, "unknown-session")}.jsonl`;
  const homes = new Set([process.env.CODEX_HOME, path.join(os.homedir(), ".codex")].filter(Boolean));
  for (const home of homes) {
    const sessionsRoot = path.join(home, "sessions");
    for (const dayOffset of [0, -1, 1]) {
      const date = new Date(Date.now() + dayOffset * 86_400_000);
      const directory = path.join(
        sessionsRoot,
        String(date.getFullYear()),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      );
      try {
        const name = (await readdir(directory)).find((entry) => entry.endsWith(sessionSuffix));
        if (name) return path.join(directory, name);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  return undefined;
}

async function transcriptToolEvidence(payload, toolUseId = payload.tool_use_id, resolvedTranscriptPath) {
  if (!toolUseId) return undefined;
  const transcriptPath = resolvedTranscriptPath || await resolveTranscriptPath(payload);
  if (!transcriptPath) return undefined;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let handle;
    try {
      const metadata = await stat(transcriptPath);
      const length = Math.min(metadata.size, MAX_TRANSCRIPT_TAIL_BYTES);
      const offset = metadata.size - length;
      const buffer = Buffer.alloc(length);
      handle = await open(transcriptPath, "r");
      await handle.read(buffer, 0, length, offset);
      let content = buffer.toString("utf8");
      if (offset > 0) content = content.slice(content.indexOf("\n") + 1);

      for (const line of content.trimEnd().split("\n").reverse()) {
        let row;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        const item = row?.payload?.item;
        if (item?.id !== toolUseId) continue;
        const exitCode = Number.isFinite(Number(item.exit_code)) ? Number(item.exit_code) : undefined;
        const status = typeof item.status === "string" ? item.status : undefined;
        const failure = hasTranscriptFailure(item, status, exitCode)
          ? classifyTranscriptFailure(item)
          : undefined;
        return {
          failed: hasTranscriptFailure(item, status, exitCode),
          ...(status ? { status } : {}),
          ...(exitCode !== undefined ? { exitCode } : {}),
          ...(failure ? { failure } : {}),
        };
      }
    } catch {
      // The transcript may not be visible to the hook process yet. Retry briefly.
    } finally {
      await handle?.close();
    }
    if (attempt < 5) await delay(20);
  }
  return undefined;
}

async function withRuntimeLock(file, callback) {
  const lock = `${file}.lock`;

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    let acquired = false;
    try {
      await mkdir(lock);
      acquired = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const metadata = await stat(lock);
        if (Date.now() - metadata.mtimeMs > STALE_LOCK_MS) {
          await rm(lock, { recursive: true, force: true });
          continue;
        }
      } catch (metadataError) {
        if (metadataError.code !== "ENOENT") throw metadataError;
      }
      await delay(LOCK_RETRY_DELAY_MS);
    }
    if (!acquired) continue;
    try {
      return await callback();
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }

  throw new Error("Timed out waiting for the AgentTape runtime lock.");
}

function eventDetails(payload) {
  const details = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!EVENT_DETAIL_OMISSIONS.has(key)) details[key] = value;
  }
  if (payload.transcript_path) details.transcript_available = true;
  if (payload.agent_transcript_path) details.agent_transcript_available = true;
  return Object.keys(details).length ? redact(details) : undefined;
}

function eventFromPayload(payload, sequence, execution) {
  const type = String(payload.hook_event_name || "Unknown");
  const event = {
    sequence,
    recordedAt: new Date().toISOString(),
    type,
  };

  if (payload.turn_id) event.turnId = String(payload.turn_id);
  if (payload.permission_mode) event.permissionMode = String(payload.permission_mode);
  if (payload.tool_name) {
    event.tool = {
      name: String(payload.tool_name),
      ...(payload.tool_use_id ? { useId: String(payload.tool_use_id) } : {}),
      ...(payload.tool_input !== undefined ? { input: redact(payload.tool_input) } : {}),
      ...(payload.tool_response !== undefined ? { output: redact(payload.tool_response) } : {}),
    };
    if (type === "PostToolUse" && (hasFailureSignal(payload.tool_response) || execution?.failed)) {
      event.tool.failed = true;
      event.tool.failure = execution?.failure || {
        kind: "tool_error",
        reason: execution?.exitCode !== undefined
          ? `Codex recorded tool exit code ${execution.exitCode}`
          : "Explicit failure signal in tool response",
      };
    }
  }

  const details = eventDetails(payload) || {};
  if (execution) {
    details.execution = {
      ...(execution.status ? { status: execution.status } : {}),
      ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
    };
  }
  if (Object.keys(details).length) event.details = details;

  return event;
}

function currentTurn(events) {
  let start = 0;
  for (let index = events.length - 2; index >= 0; index -= 1) {
    if (events[index].type === "Stop" || events[index].type === "SessionEnd") {
      start = index + 1;
      break;
    }
  }
  return events.slice(start);
}

function failureFromExecution(execution) {
  if (execution.failure) return execution.failure;
  if (execution.exitCode !== undefined) {
    return {
      kind: "tool_error",
      reason: `Codex recorded tool exit code ${execution.exitCode} before PostToolUse`,
    };
  }
  return {
    kind: "tool_error",
    reason: "Codex recorded a failed tool termination before PostToolUse.",
  };
}

function normalizedFailureCode(kind) {
  return {
    permission_denied: "PERMISSION_DENIED",
    timeout: "TIMEOUT",
    rate_limited: "RATE_LIMITED",
    malformed_json: "MALFORMED_JSON",
    truncated_response: "TRUNCATED_RESPONSE",
  }[kind] || "TOOL_ERROR";
}

function transcriptTerminationEvent(event, execution) {
  const failure = failureFromExecution(execution);
  const status = FAILURE_STATUS.test(execution.status || "")
    ? execution.status.toLowerCase()
    : "failed";
  const terminationEvidence = {
    source: "codex-transcript",
    postToolUseObserved: false,
    status,
    ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
  };

  return {
    sequence: event.sequence + 1,
    recordedAt: event.recordedAt,
    type: "PostToolUse",
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.permissionMode ? { permissionMode: event.permissionMode } : {}),
    tool: {
      name: event.tool.name,
      ...(event.tool.useId ? { useId: event.tool.useId } : {}),
      output: {
        status,
        ...(execution.exitCode !== undefined ? { exitCode: execution.exitCode } : {}),
        error: {
          code: normalizedFailureCode(failure.kind),
          message: failure.reason,
        },
      },
      failed: true,
      failure,
    },
    details: { terminationEvidence },
  };
}

async function reconcileUnmatchedToolFailures(payload, events) {
  const completedUseIds = new Set(events
    .filter((event) => event.type === "PostToolUse" && event.tool?.useId)
    .map((event) => event.tool.useId));
  const unmatched = events.filter((event) => (
    event.type === "PreToolUse"
    && event.tool?.useId
    && !completedUseIds.has(event.tool.useId)
  ));
  if (!unmatched.length) return events;

  const transcriptPath = await resolveTranscriptPath(payload);
  if (!transcriptPath) return events;

  const failures = new Map();
  for (const event of unmatched) {
    const execution = await transcriptToolEvidence(payload, event.tool.useId, transcriptPath);
    if (execution?.failed) failures.set(event.tool.useId, execution);
  }
  if (!failures.size) return events;

  const reconciled = [];
  for (const event of events) {
    reconciled.push(event);
    const execution = failures.get(event.tool?.useId);
    if (event.type === "PreToolUse" && execution) {
      reconciled.push(transcriptTerminationEvent(event, execution));
    }
  }

  return reconciled.map((event, index) => ({ ...event, sequence: index + 1 }));
}

function buildTape(payload, events) {
  const toolEvents = events.filter((event) => event.type === "PostToolUse");
  const failedEvents = toolEvents.filter((event) => event.tool?.failed);
  const capturedAt = events[0]?.recordedAt || new Date().toISOString();
  const completedAt = events.at(-1)?.recordedAt || capturedAt;
  const digest = createHash("sha256")
    .update(JSON.stringify({ session: payload.session_id, turn: payload.turn_id, events }))
    .digest("hex")
    .slice(0, 12);

  return {
    format: "agenttape.tape",
    version: TAPE_VERSION,
    id: `tape_${digest}`,
    status: failedEvents.length ? "failed" : "captured",
    capturedAt,
    completedAt,
    source: {
      adapter: "codex-hooks",
      sessionId: String(payload.session_id || "unknown-session"),
      ...(payload.turn_id ? { turnId: String(payload.turn_id) } : {}),
      cwd: portableCwd(payload.cwd),
      ...(payload.model ? { model: String(payload.model) } : {}),
      coverage: "supported-local-hooks",
    },
    summary: {
      eventCount: events.length,
      toolCallCount: toolEvents.length,
      failedToolCallCount: failedEvents.length,
      ...(failedEvents[0] ? { firstFailureSequence: failedEvents[0].sequence } : {}),
    },
    limitations: [
      "Hosted tools outside the Codex local hook path are not captured.",
      "Phase 1 tapes are structural evidence and are not bit-exact replay artifacts.",
    ],
    events,
  };
}

async function finalize(payload, events) {
  const turnEvents = await reconcileUnmatchedToolFailures(payload, currentTurn(events));
  const hasEvidence = turnEvents.some((event) => event.type !== "SessionEnd");
  if (!hasEvidence || (payload.hook_event_name === "Stop" && payload.stop_hook_active)) return null;

  const tape = buildTape(payload, turnEvents);
  const tapesDirectory = path.join(captureRoot(payload.cwd), "tapes");
  await mkdir(tapesDirectory, { recursive: true });
  const file = path.join(tapesDirectory, `${tape.id}.tape`);
  await writeFile(file, `${JSON.stringify(tape, null, 2)}\n`, "utf8");
  return { file, tape };
}

export async function recordHook(payload) {
  const file = runtimePath(payload);
  await mkdir(path.dirname(file), { recursive: true });
  return withRuntimeLock(file, async () => {
    const execution = payload.hook_event_name === "PostToolUse"
      ? await transcriptToolEvidence(payload)
      : undefined;
    const events = await readEvents(file);
    const event = eventFromPayload(payload, events.length + 1, execution);
    await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
    events.push(event);

    if (payload.hook_event_name === "Stop" || payload.hook_event_name === "SessionEnd") {
      return finalize(payload, events);
    }
    return null;
  });
}

export async function listTapes(cwd = process.cwd()) {
  const directory = path.join(captureRoot(cwd), "tapes");
  let names;
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".tape"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const tapes = (await Promise.all(names.map(async (name) => {
    const file = path.join(directory, name);
    try {
      const [content, metadata] = await Promise.all([readFile(file, "utf8"), stat(file)]);
      return { file, tape: JSON.parse(content), modifiedAt: metadata.mtimeMs };
    } catch {
      return null;
    }
  }))).filter(Boolean);

  return tapes.sort((left, right) => right.modifiedAt - left.modifiedAt);
}
