import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoPath = path.join(projectRoot, "public", "demo", "agenttape-demo.json");

test("publishes a deterministic, redacted, offline demo bundle", async () => {
  const source = await readFile(demoPath, "utf8");
  const demo = JSON.parse(source);
  assert.equal(demo.format, "agenttape.demo");
  assert.equal(demo.list.tapes[0].id, "tape_fixture_permission_denied");
  assert.equal(demo.inspection.redaction.applied, true);
  assert.deepEqual(Object.keys(demo.forks).sort(), [
    "malformed_json",
    "permission_denied",
    "timeout",
    "truncated_response",
  ]);
  for (const replay of Object.values(demo.forks)) {
    assert.equal(replay.status, "completed");
    assert.equal(replay.evidence.modelCallsBeforeFork, 0);
    assert.equal(replay.evidence.liveToolCalls, 0);
  }
  assert.equal(source.includes("fixture-secret"), false);
});
