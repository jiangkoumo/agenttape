import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

export const TAPE_VERSION = 1;

const SECRET_KEY = /(?:authorization|cookie|credential|password|secret|token|api[-_]?key)/i;
const FAILURE_STATUS = /^(?:denied|error|failed|failure|forbidden|cancelled)$/i;
const MAX_STRING_LENGTH = 32_768;
const MAX_ARRAY_LENGTH = 100;
const MAX_DEPTH = 8;

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

function hasFailureSignal(value, depth = 0) {
  if (depth > MAX_DEPTH || value == null) return false;
  if (typeof value === "string") {
    return /\b(?:permission denied|access denied|not authorized|process exited with code [1-9]\d*|exit status [1-9]\d*)\b/i.test(value);
  }
  if (Array.isArray(value)) return value.some((item) => hasFailureSignal(item, depth + 1));
  if (typeof value !== "object") return false;

  for (const [key, item] of Object.entries(value)) {
    if (/^(?:is_error|isError)$/i.test(key) && item === true) return true;
    if (/^(?:success|ok)$/i.test(key) && item === false) return true;
    if (/^(?:exit_code|exitCode)$/i.test(key) && item != null && Number.isFinite(Number(item)) && Number(item) !== 0) return true;
    if (/^(?:status_code|statusCode)$/i.test(key) && item != null && Number.isFinite(Number(item)) && Number(item) >= 400) return true;
    if (/^(?:status|state)$/i.test(key) && typeof item === "string" && FAILURE_STATUS.test(item)) return true;
    if (hasFailureSignal(item, depth + 1)) return true;
  }

  return false;
}

function safeSegment(value, fallback) {
  const normalized = String(value || fallback).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80);
  return normalized || fallback;
}

function captureRoot(cwd) {
  return path.join(path.resolve(cwd || process.cwd()), ".agent-tape");
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

function eventFromPayload(payload, sequence) {
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
    if (type === "PostToolUse" && hasFailureSignal(payload.tool_response)) {
      event.tool.failed = true;
      event.tool.failure = { kind: "tool_error", reason: "Explicit failure signal in tool response" };
    }
  }

  if (type === "PermissionRequest") {
    const details = { ...payload };
    for (const key of [
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
    ]) delete details[key];
    if (Object.keys(details).length) event.details = redact(details);
  }

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
      cwd: path.resolve(payload.cwd || process.cwd()),
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
  const turnEvents = currentTurn(events);
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
  const events = await readEvents(file);
  const event = eventFromPayload(payload, events.length + 1);
  await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
  events.push(event);

  if (payload.hook_event_name === "Stop" || payload.hook_event_name === "SessionEnd") {
    return finalize(payload, events);
  }
  return null;
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
