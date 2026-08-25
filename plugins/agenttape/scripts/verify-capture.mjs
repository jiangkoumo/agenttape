#!/usr/bin/env node

import path from "node:path";

import { validateTape } from "./tape-schema.mjs";
import { listTapes } from "./tape-store.mjs";

function values(args, name) {
  return args.flatMap((value, index) => value === name && args[index + 1] ? [args[index + 1]] : []);
}

function option(args, name) {
  return values(args, name).at(-1);
}

function usage() {
  return [
    "Usage:",
    "  verify-capture.mjs [--root <project>] [--must-fail] [--require-redaction]",
    "                     [--require-event <HookName>]...",
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(usage());
  process.exit(0);
}

const root = path.resolve(option(args, "--root") || process.cwd());
const requiredEvents = values(args, "--require-event");
const entries = await listTapes(root);
if (!entries.length) {
  process.stderr.write("No AgentTape captures found.\n");
  process.exit(2);
}

const tape = validateTape(entries[0].tape);
const serialized = JSON.stringify(tape);
const eventTypes = [...new Set(tape.events.map((event) => event.type))];
const missingEvents = requiredEvents.filter((name) => !eventTypes.includes(name));
const redactionPresent = serialized.includes("[REDACTED]");
const obviousSecretPresent = /\bsk-[A-Za-z0-9_-]{8,}\b|Bearer\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]+/i.test(serialized);
const failures = [];

if (args.includes("--must-fail") && tape.status !== "failed") failures.push("latest tape is not failed");
if (args.includes("--require-redaction") && !redactionPresent) failures.push("latest tape has no redaction marker");
if (obviousSecretPresent) failures.push("latest tape contains an obvious unredacted secret pattern");
if (missingEvents.length) failures.push(`missing events: ${missingEvents.join(", ")}`);

const result = {
  tapeId: tape.id,
  status: tape.status,
  coverage: tape.source.coverage,
  eventCount: tape.summary.eventCount,
  failedToolCallCount: tape.summary.failedToolCallCount,
  eventTypes,
  redactionPresent,
  obviousSecretPresent,
  passed: failures.length === 0,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
