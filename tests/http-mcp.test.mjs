import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { handleAgentTapeRemoteRequest } from "../remote/worker.mjs";
import { verifyRemoteMcp } from "../scripts/verify-remote-mcp.mjs";

const fixture = JSON.parse(await readFile(new URL("../plugins/agenttape/fixtures/permission-denied.tape", import.meta.url), "utf8"));
const regression = JSON.parse(await readFile(new URL("./agenttape/fixture_permission_denied-timeout.tape", import.meta.url), "utf8"));
const testEnv = {
  AGENTTAPE_ALLOWED_ORIGINS: "https://chatgpt.com",
  AGENTTAPE_WEBSITE_URL: "https://example.test",
};

async function workerFetch(input, init) {
  return handleAgentTapeRemoteRequest(new Request(input, init), testEnv);
}

async function connectedClient() {
  const client = new Client({ name: "agenttape-http-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("https://agenttape.test/mcp"), { fetch: workerFetch });
  await client.connect(transport);
  return client;
}

test("serves four stateless read-only tools over Streamable HTTP", async () => {
  const client = await connectedClient();
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), ["fork_run", "inspect_tape", "run_assertions", "validate_tape"]);
    for (const tool of listed.tools) {
      assert.equal(tool.annotations.readOnlyHint, true);
      assert.equal(tool.annotations.destructiveHint, false);
      assert.equal(tool.annotations.openWorldHint, false);
    }

    const validated = await client.callTool({ name: "validate_tape", arguments: { tape: fixture } });
    assert.equal(validated.isError, undefined);
    assert.equal(validated.structuredContent.valid, true);
    assert.equal(validated.structuredContent.redactionApplied, true);

    const inspected = await client.callTool({ name: "inspect_tape", arguments: { tape: fixture } });
    assert.equal(inspected.structuredContent.run.id, fixture.id);
    assert.equal(inspected.structuredContent.failures[0].toolName, "github.create_issue");
    assert.equal(Object.hasOwn(inspected.structuredContent, "events"), false);

    const forked = await client.callTool({
      name: "fork_run",
      arguments: { tape: fixture, boundarySequence: 2, targetSequence: 3, injection: { kind: "timeout", parameters: { timeoutMs: 5000 } } },
    });
    assert.equal(forked.structuredContent.status, "completed");
    assert.equal(forked.structuredContent.evidence.modelCallsBeforeFork, 0);
    assert.equal(forked.structuredContent.evidence.liveToolCalls, 0);

    const asserted = await client.callTool({ name: "run_assertions", arguments: { tape: regression } });
    assert.equal(asserted.structuredContent.passed, true);
    assert.deepEqual(asserted.structuredContent.summary, { total: 4, passed: 4, failed: 0 });
    assert.equal(Object.hasOwn(asserted.structuredContent.assertions[0], "actual"), false);
  } finally {
    await client.close();
  }
});

test("rejects unredacted, oversized, and cross-origin inputs without echoing values", async () => {
  const client = await connectedClient();
  try {
    const unredacted = structuredClone(fixture);
    unredacted.redactions.applied = false;
    const result = await client.callTool({ name: "validate_tape", arguments: { tape: unredacted } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /^REMOTE_TAPE_NOT_REDACTED:/);
    assert.doesNotMatch(result.content[0].text, /github\.create_issue/);
  } finally {
    await client.close();
  }

  const oversized = await handleAgentTapeRemoteRequest(new Request("https://agenttape.test/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "x".repeat(1_100_001),
  }), testEnv);
  assert.equal(oversized.status, 413);

  const crossOrigin = await handleAgentTapeRemoteRequest(new Request("https://agenttape.test/mcp", {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example" },
  }), testEnv);
  assert.equal(crossOrigin.status, 403);
});

test("publishes health and policy endpoints without storage or challenge leakage", async () => {
  const health = await handleAgentTapeRemoteRequest(new Request("https://agenttape.test/health"), testEnv);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { service: "agenttape-remote", version: "0.3.1", status: "ok", storage: "none" });

  for (const path of ["/privacy", "/terms", "/support"]) {
    const response = await handleAgentTapeRemoteRequest(new Request(`https://agenttape.test${path}`), testEnv);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
  }

  const challenge = await handleAgentTapeRemoteRequest(new Request("https://agenttape.test/.well-known/openai-apps-challenge"), testEnv);
  assert.equal(challenge.status, 404);
});

test("runs the production verification workflow against the Worker contract", async () => {
  const result = await verifyRemoteMcp("https://agenttape.test", workerFetch);
  assert.deepEqual(result, { origin: "https://agenttape.test", tools: 4, assertions: 4 });
});
