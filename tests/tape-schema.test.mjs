import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TapeValidationError,
  calculateReplayConfidence,
  parseTape,
  validateTape,
} from "../plugins/agenttape/scripts/tape-schema.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(projectRoot, "plugins", "agenttape");
const fixtureRoot = path.join(pluginRoot, "fixtures");
const cli = path.join(pluginRoot, "scripts", "agenttape.mjs");

test("validates every fixed version 1 fixture offline", async () => {
  const names = (await readdir(fixtureRoot)).filter((name) => name.endsWith(".tape")).sort();
  assert.deepEqual(names, ["malformed-json.tape", "permission-denied.tape", "timeout.tape"]);

  for (const name of names) {
    const text = await readFile(path.join(fixtureRoot, name), "utf8");
    const tape = parseTape(text);
    assert.equal(tape.version, 1);
    assert.doesNotMatch(text, /\bsk-[A-Za-z0-9_-]{8,}\b|Bearer\s+(?!\[REDACTED\])\S+/i);

    const result = spawnSync(process.execPath, [cli, "validate", path.join(fixtureRoot, name)], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^valid tape_fixture_/);
  }
});

test("returns explicit errors for missing fields and unsupported major versions", async () => {
  const fixture = JSON.parse(await readFile(path.join(fixtureRoot, "timeout.tape"), "utf8"));
  const missingId = structuredClone(fixture);
  delete missingId.id;

  assert.throws(
    () => validateTape(missingId),
    (error) => error instanceof TapeValidationError
      && error.code === "TAPE_SCHEMA_INVALID"
      && error.message.includes("missing required property id"),
  );

  const unsupported = structuredClone(fixture);
  unsupported.version = 2;
  assert.throws(
    () => validateTape(unsupported),
    (error) => error instanceof TapeValidationError
      && error.code === "UNSUPPORTED_TAPE_VERSION"
      && error.message.includes("major version 2"),
  );

  unsupported.version = "sk-super-secret-token";
  assert.throws(
    () => validateTape(unsupported),
    (error) => error.code === "UNSUPPORTED_TAPE_VERSION"
      && !error.message.includes("sk-super-secret-token"),
  );
});

test("never includes captured values in JSON or schema validation errors", async () => {
  const secret = "sk-super-secret-token";
  assert.throws(
    () => parseTape(`{\"secret\":\"${secret}\"`),
    (error) => error.code === "MALFORMED_TAPE_JSON" && !error.message.includes(secret),
  );

  const fixture = JSON.parse(await readFile(path.join(fixtureRoot, "timeout.tape"), "utf8"));
  fixture.id = secret;
  assert.throws(
    () => validateTape(fixture),
    (error) => error.code === "TAPE_SCHEMA_INVALID" && !error.message.includes(secret),
  );
});

test("calculates replay confidence from documented downgrade inputs", () => {
  const confidence = calculateReplayConfidence({
    coverage: "supported-local-hooks",
    capturedToolResults: true,
    eventSequenceComplete: true,
    externalStateCaptured: false,
    redactionsPresent: true,
    unknownToolCount: 0,
    modelCallsBeforeFork: 0,
  });

  assert.equal(confidence.score, 0.65);
  assert.equal(confidence.level, "medium");
  assert.equal(confidence.reasons.length, 3);
});

test("publishes standalone run, event, artifact, redaction, fork, injection, and assertion definitions", async () => {
  const schema = JSON.parse(await readFile(path.join(pluginRoot, "schemas", "tape-v1.schema.json"), "utf8"));
  for (const definition of ["run", "event", "artifact", "redaction", "fork", "injection", "assertion"]) {
    assert.ok(schema.$defs[definition], `missing schema definition: ${definition}`);
  }
});
