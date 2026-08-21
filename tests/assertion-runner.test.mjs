import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runRegressionTape } from "../plugins/agenttape/replay/assertions.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(projectRoot, "plugins", "agenttape");
const fixtureRoot = path.join(pluginRoot, "fixtures");
const cli = path.join(pluginRoot, "scripts", "agenttape.mjs");

test("executes every fixed regression tape offline", async () => {
  for (const name of ["permission-denied.tape", "timeout.tape", "malformed-json.tape"]) {
    const file = path.join(fixtureRoot, name);
    const tape = JSON.parse(await readFile(file, "utf8"));
    const result = runRegressionTape(tape);
    assert.equal(result.passed, true, `${name}: ${JSON.stringify(result.assertions)}`);
    assert.equal(result.replay.evidence.modelCallsBeforeFork, 0);
    assert.equal(result.replay.evidence.liveToolCalls, 0);

    const cliResult = spawnSync(process.execPath, [cli, "test", file], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { PATH: process.env.PATH || "" },
    });
    assert.equal(cliResult.status, 0, cliResult.stderr);
    assert.match(cliResult.stdout, /^PASS tape_fixture_/);
  }
});

test("returns a non-zero exit code and redacted diff for assertion failures", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agenttape-assertion-"));
  try {
    const tape = JSON.parse(await readFile(path.join(fixtureRoot, "timeout.tape"), "utf8"));
    tape.assertions[0].expected = "sk-super-secret-token";
    const file = path.join(directory, "failure.tape");
    await writeFile(file, `${JSON.stringify(tape, null, 2)}\n`);

    const result = spawnSync(process.execPath, [cli, "test", file], {
      cwd: projectRoot,
      encoding: "utf8",
      env: { PATH: process.env.PATH || "" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\[field_equals\]/);
    assert.match(result.stderr, /\[REDACTED\]/);
    assert.doesNotMatch(result.stderr, /sk-super-secret-token/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
