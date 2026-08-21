import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeAgentTapeApi } from "../plugins/agenttape/http/local-api.mjs";
import {
  AgentTapeClientError,
  forkTape,
  inspectTape,
  listTapes,
  loadDemo,
  saveRegression,
} from "../src/agenttape-client.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(projectRoot, "plugins", "agenttape", "fixtures", "permission-denied.tape");

async function fixtureWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-api-"));
  const tapes = path.join(workspace, ".agent-tape", "tapes");
  await mkdir(tapes, { recursive: true });
  await copyFile(fixture, path.join(tapes, "permission-denied.tape"));
  return workspace;
}

test("serves the real workspace list, inspection, fork, and save actions", async () => {
  const workspace = await fixtureWorkspace();
  try {
    const listed = await executeAgentTapeApi(workspace, {
      method: "GET",
      pathname: "/api/agenttape/tapes",
      searchParams: new URLSearchParams("limit=10"),
    });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.tapes[0].id, "tape_fixture_permission_denied");

    const inspected = await executeAgentTapeApi(workspace, {
      method: "GET",
      pathname: "/api/agenttape/tapes/tape_fixture_permission_denied",
    });
    assert.equal(inspected.body.events.length, 4);
    assert.equal(inspected.body.failures[0].kind, "permission_denied");

    const request = {
      id: "tape_fixture_permission_denied",
      boundarySequence: 2,
      targetSequence: 3,
      injection: "timeout",
    };
    const forked = await executeAgentTapeApi(workspace, {
      method: "POST",
      pathname: "/api/agenttape/forks",
      body: request,
    });
    assert.equal(forked.status, 200);
    assert.equal(forked.body.status, "completed");
    assert.equal(forked.body.evidence.liveToolCalls, 0);

    const saved = await executeAgentTapeApi(workspace, {
      method: "POST",
      pathname: "/api/agenttape/regressions",
      body: { ...request, filename: "permission-timeout.tape" },
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.path, "tests/agenttape/permission-timeout.tape");

    const duplicate = await executeAgentTapeApi(workspace, {
      method: "POST",
      pathname: "/api/agenttape/regressions",
      body: { ...request, filename: "permission-timeout.tape" },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, "REGRESSION_EXISTS");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects invalid API inputs and UI overwrite requests", async () => {
  const workspace = await fixtureWorkspace();
  try {
    const invalidId = await executeAgentTapeApi(workspace, {
      method: "GET",
      pathname: "/api/agenttape/tapes/..%2Foutside",
    });
    assert.equal(invalidId.status, 400);
    assert.equal(invalidId.body.error.code, "INVALID_TAPE_ID");

    const overwrite = await executeAgentTapeApi(workspace, {
      method: "POST",
      pathname: "/api/agenttape/regressions",
      body: {
        id: "tape_fixture_permission_denied",
        boundarySequence: 2,
        injection: "timeout",
        filename: "safe.tape",
        overwrite: true,
      },
    });
    assert.equal(overwrite.status, 409);
    assert.equal(overwrite.body.error.code, "OVERWRITE_NOT_ALLOWED");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("browser client uses the local API contract and preserves safe errors", async () => {
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: options.method === "POST" ? 201 : 200,
      json: async () => ({ ok: true }),
    };
  };

  await listTapes(fakeFetch);
  await inspectTape("tape_fixture", fakeFetch);
  await forkTape({ id: "tape_fixture" }, fakeFetch);
  await saveRegression({ id: "tape_fixture" }, fakeFetch);
  await loadDemo(fakeFetch);
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/agenttape/tapes?limit=100",
    "/api/agenttape/tapes/tape_fixture",
    "/api/agenttape/forks",
    "/api/agenttape/regressions",
    "/demo/agenttape-demo.json",
  ]);
  assert.equal(calls[2].options.method, "POST");
  assert.equal(calls[2].options.headers["Content-Type"], "application/json");

  await assert.rejects(
    () => listTapes(async () => { throw new Error("network details"); }),
    (error) => error instanceof AgentTapeClientError
      && error.code === "API_UNAVAILABLE"
      && !error.message.includes("network details"),
  );
});
