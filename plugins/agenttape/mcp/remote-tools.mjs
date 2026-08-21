import { runRegressionTape } from "../replay/assertions.mjs";
import { structuralReplay } from "../replay/structural-replay.mjs";
import { TapeValidationError, validateTape } from "../scripts/tape-schema.mjs";
import { inspectTape, summarizeTape } from "./tape-access.mjs";

export const MAX_REMOTE_TAPE_BYTES = 1_048_576;

export class RemoteTapeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RemoteTapeError";
    this.code = code;
  }
}

function encodedSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    throw new RemoteTapeError("TAPE_NOT_SERIALIZABLE", "Tape must be a JSON-serializable object.");
  }
}

export function requireRemoteTape(tape) {
  if (encodedSize(tape) > MAX_REMOTE_TAPE_BYTES) {
    throw new RemoteTapeError("TAPE_TOO_LARGE", "Remote tape input must not exceed 1 MiB.");
  }
  validateTape(tape);
  if (tape.redactions?.applied !== true) {
    throw new RemoteTapeError(
      "REMOTE_TAPE_NOT_REDACTED",
      "Remote processing requires a tape whose redactions.applied field is true.",
    );
  }
  return tape;
}

export function validateRemoteTape(tape) {
  const validated = requireRemoteTape(tape);
  const summary = summarizeTape(validated);
  return {
    valid: true,
    id: validated.id,
    version: validated.version,
    status: validated.status,
    eventCount: validated.summary.eventCount,
    redactionApplied: summary.redactionApplied,
    replayConfidence: summary.replayConfidence,
  };
}

export function inspectRemoteTape(tape) {
  const inspected = inspectTape(requireRemoteTape(tape));
  const eventTypes = {};
  for (const event of inspected.events) {
    eventTypes[event.type] = (eventTypes[event.type] || 0) + 1;
  }
  return {
    run: inspected.run,
    eventTypes,
    failures: inspected.failures,
    replayConfidence: inspected.replayConfidence,
    redaction: inspected.redaction,
  };
}

export function forkRemoteTape(tape, options) {
  const validated = requireRemoteTape(tape);
  const replay = structuralReplay(validated, options);
  return {
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
}

export function runRemoteAssertions(tape) {
  const result = runRegressionTape(requireRemoteTape(tape));
  return {
    tapeId: result.tapeId,
    passed: result.passed,
    ...(result.error ? { error: result.error } : {}),
    ...(result.summary ? { summary: result.summary } : {}),
    assertions: result.assertions.map(({ index, kind, passed, message }) => ({ index, kind, passed, message })),
    evidence: result.replay?.evidence || null,
  };
}

export function remoteToolError(error) {
  if (error instanceof RemoteTapeError || error instanceof TapeValidationError) {
    return {
      isError: true,
      content: [{ type: "text", text: `${error.code}: ${error.message}` }],
    };
  }
  return {
    isError: true,
    content: [{ type: "text", text: "REMOTE_PROCESSING_FAILED: AgentTape could not process the supplied tape." }],
  };
}
