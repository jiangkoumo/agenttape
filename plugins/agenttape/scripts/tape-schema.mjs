import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

export const SUPPORTED_TAPE_VERSION = 1;

const schemaUrl = new URL("../schemas/tape-v1.schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

export class TapeValidationError extends Error {
  constructor(code, message, issues = []) {
    super(message);
    this.name = "TapeValidationError";
    this.code = code;
    this.issues = issues;
  }
}

function issueMessage(error) {
  const path = error.instancePath || "/";
  if (error.keyword === "required") {
    return `${path} missing required property ${error.params.missingProperty}`;
  }
  if (error.keyword === "additionalProperties") {
    return `${path} contains an unsupported property`;
  }
  return `${path} ${error.message}`;
}

export function calculateReplayConfidence(inputs) {
  let score = 1;
  const reasons = [];
  const lower = (amount, reason) => {
    score -= amount;
    reasons.push(reason);
  };

  const coveragePenalty = {
    complete: 0,
    "supported-local-hooks": 0.15,
    partial: 0.35,
    unknown: 0.55,
  }[inputs.coverage];
  if (coveragePenalty === undefined) {
    throw new TapeValidationError("INVALID_CONFIDENCE_INPUT", "Replay confidence coverage is unsupported.");
  }
  if (coveragePenalty) lower(coveragePenalty, `Coverage is ${inputs.coverage}.`);
  if (!inputs.capturedToolResults) lower(0.25, "One or more tool results were not captured.");
  if (!inputs.eventSequenceComplete) lower(0.2, "The event sequence is incomplete.");
  if (!inputs.externalStateCaptured) lower(0.15, "External state was not captured.");
  if (inputs.redactionsPresent) lower(0.05, "Redaction may hide replay-relevant values.");
  if (inputs.unknownToolCount > 0) {
    lower(Math.min(0.3, inputs.unknownToolCount * 0.1), `${inputs.unknownToolCount} tool type(s) are unsupported.`);
  }
  if (inputs.modelCallsBeforeFork > 0) {
    lower(0.35, "Replay made model calls before the fork boundary.");
  }

  score = Math.max(0, Math.round(score * 100) / 100);
  const level = score >= 0.85
    ? "high"
    : score >= 0.65
      ? "medium"
      : score >= 0.4
        ? "low"
        : "playback_only";
  return { score, level, inputs: { ...inputs }, reasons };
}

export function validateTape(tape) {
  if (!tape || typeof tape !== "object" || Array.isArray(tape)) {
    throw new TapeValidationError("TAPE_SCHEMA_INVALID", "Tape must be a JSON object.");
  }
  if (tape.version !== undefined && tape.version !== SUPPORTED_TAPE_VERSION) {
    const versionLabel = Number.isInteger(tape.version) ? String(tape.version) : "value";
    throw new TapeValidationError(
      "UNSUPPORTED_TAPE_VERSION",
      `Unsupported AgentTape major version ${versionLabel}; supported major version is ${SUPPORTED_TAPE_VERSION}.`,
    );
  }
  if (!validateSchema(tape)) {
    const issues = validateSchema.errors.map(issueMessage);
    throw new TapeValidationError("TAPE_SCHEMA_INVALID", `Tape failed schema validation: ${issues.join("; ")}`, issues);
  }
  if (tape.replay?.confidence) {
    const calculated = calculateReplayConfidence(tape.replay.confidence.inputs);
    const confidenceMatches = calculated.score === tape.replay.confidence.score
      && calculated.level === tape.replay.confidence.level
      && JSON.stringify(calculated.reasons) === JSON.stringify(tape.replay.confidence.reasons);
    if (!confidenceMatches) {
      throw new TapeValidationError(
        "REPLAY_CONFIDENCE_MISMATCH",
        `Replay confidence must be ${calculated.score} (${calculated.level}) for the declared inputs.`,
      );
    }
  }
  return tape;
}

export function parseTape(text) {
  let tape;
  try {
    tape = JSON.parse(text);
  } catch {
    throw new TapeValidationError("MALFORMED_TAPE_JSON", "Tape is not valid JSON.");
  }
  return validateTape(tape);
}
