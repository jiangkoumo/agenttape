import { createHash } from "node:crypto";

import { calculateReplayConfidence, validateTape } from "../scripts/tape-schema.mjs";

export const SUPPORTED_INJECTIONS = [
  "permission_denied",
  "timeout",
  "rate_limited",
  "malformed_json",
  "truncated_response",
];

function clone(value) {
  return structuredClone(value);
}

function hasRedaction(value, depth = 0) {
  if (depth > 10 || value == null) return false;
  if (typeof value === "string") return value.includes("[REDACTED]");
  if (Array.isArray(value)) return value.some((item) => hasRedaction(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.values(value).some((item) => hasRedaction(item, depth + 1));
}

function confidenceInputs(tape) {
  const toolResults = tape.events.filter((event) => event.type === "PostToolUse");
  return {
    coverage: tape.source.coverage,
    capturedToolResults: toolResults.every((event) => Object.hasOwn(event.tool || {}, "output")),
    eventSequenceComplete: tape.events.every((event, index) => event.sequence === index + 1),
    externalStateCaptured: false,
    redactionsPresent: tape.redactions?.applied === true || hasRedaction(tape),
    unknownToolCount: 0,
    modelCallsBeforeFork: 0,
  };
}

function injectedOutput(kind, parameters = {}) {
  if (kind === "permission_denied") {
    return { status: "denied", errorCode: "PERMISSION_DENIED", error: { code: "PERMISSION_DENIED", message: "Permission denied" } };
  }
  if (kind === "timeout") {
    const timeoutMs = Number.isInteger(parameters.timeoutMs)
      ? Math.min(Math.max(parameters.timeoutMs, 1), 300_000)
      : 30_000;
    return { status: "failed", errorCode: "TIMEOUT", error: { code: "TIMEOUT", message: "Tool call timed out" }, timeoutMs };
  }
  if (kind === "rate_limited") {
    const retryAfterSeconds = Number.isInteger(parameters.retryAfterSeconds)
      ? Math.min(Math.max(parameters.retryAfterSeconds, 1), 86_400)
      : 60;
    return {
      status: "failed",
      errorCode: "RATE_LIMITED",
      error: { code: "RATE_LIMITED", message: "Rate limit exceeded (HTTP 429). Please retry later." },
      statusCode: 429,
      retryAfterSeconds,
    };
  }
  if (kind === "malformed_json") {
    return { status: "error", errorCode: "MALFORMED_JSON", error: { code: "MALFORMED_JSON", message: "Recorded response is not valid JSON" } };
  }
  const maxBytes = Number.isInteger(parameters.maxBytes)
    ? Math.min(Math.max(parameters.maxBytes, 1), 1_048_576)
    : 1024;
  return {
    status: "failed",
    errorCode: "TRUNCATED_RESPONSE",
    error: { code: "TRUNCATED_RESPONSE", message: "Recorded response was truncated" },
    truncated: true,
    maxBytes,
  };
}

export function createBranchManifest(tape, { boundarySequence, targetSequence, injection }) {
  const digest = createHash("sha256")
    .update(JSON.stringify({ tapeId: tape.id, boundarySequence, targetSequence, injection }))
    .digest("hex")
    .slice(0, 12);
  return {
    format: "agenttape.branch",
    version: 1,
    id: `branch_${digest}`,
    sourceTapeId: tape.id,
    boundarySequence,
    targetSequence,
    mode: "recorded-result-substitution",
    createdAt: tape.completedAt,
    injection: {
      kind: injection.kind,
      targetSequence,
      mode: "recorded-result-substitution",
      ...(injection.parameters ? { parameters: clone(injection.parameters) } : {}),
    },
  };
}

function playbackOnly(tape, reason, boundarySequence) {
  return {
    format: "agenttape.replay-result",
    version: 1,
    sourceTapeId: tape.id,
    status: "playback_only",
    reason,
    evidence: {
      replayedEventCount: Math.max(0, boundarySequence || 0),
      modelCallsBeforeFork: 0,
      liveToolCalls: 0,
    },
  };
}

export function structuralReplay(tape, options) {
  validateTape(tape);
  const boundarySequence = options?.boundarySequence;
  const injection = options?.injection;
  if (!Number.isInteger(boundarySequence) || boundarySequence < 1 || boundarySequence >= tape.events.length) {
    return playbackOnly(tape, "The fork boundary is missing or outside the recorded event sequence.", boundarySequence);
  }
  if (!injection || !SUPPORTED_INJECTIONS.includes(injection.kind)) {
    return playbackOnly(tape, "The requested injection is not supported by structural replay.", boundarySequence);
  }

  const target = Number.isInteger(options.targetSequence)
    ? tape.events.find((event) => event.sequence === options.targetSequence)
    : tape.events.find((event) => event.sequence > boundarySequence && event.type === "PostToolUse");
  if (!target || target.sequence <= boundarySequence || target.type !== "PostToolUse" || !target.tool) {
    return playbackOnly(tape, "No replayable PostToolUse event exists after the fork boundary.", boundarySequence);
  }

  const output = injectedOutput(injection.kind, injection.parameters);
  const injectedEvent = clone(target);
  injectedEvent.tool.output = output;
  injectedEvent.tool.failed = true;
  injectedEvent.tool.failure = {
    kind: injection.kind,
    reason: `Injected ${injection.kind} through recorded-result substitution`,
  };
  const prefix = tape.events.filter((event) => event.sequence <= boundarySequence).map(clone);
  const branch = createBranchManifest(tape, {
    boundarySequence,
    targetSequence: target.sequence,
    injection,
  });

  return {
    format: "agenttape.replay-result",
    version: 1,
    sourceTapeId: tape.id,
    status: "completed",
    mode: "structural",
    branch,
    events: [...prefix, injectedEvent],
    finalStatus: "failed",
    diff: {
      targetSequence: target.sequence,
      path: `/events/${target.sequence - 1}/tool/output`,
      before: clone(target.tool.output),
      after: clone(output),
      changed: JSON.stringify(target.tool.output) !== JSON.stringify(output),
    },
    confidence: calculateReplayConfidence(confidenceInputs(tape)),
    evidence: {
      replayedEventCount: prefix.length,
      modelCallsBeforeFork: 0,
      liveToolCalls: 0,
    },
    limitations: [
      "Replay stops at the injected tool result and does not regenerate downstream agent reasoning.",
      "Hosted tools and uncaptured external state remain outside structural replay coverage.",
    ],
  };
}
