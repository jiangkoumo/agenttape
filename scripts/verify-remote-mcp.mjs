import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const expectedTools = ["fork_run", "inspect_tape", "run_assertions", "validate_tape"];
const fixtureUrl = new URL("../plugins/agenttape/fixtures/permission-denied.tape", import.meta.url);
const regressionUrl = new URL("../tests/agenttape/fixture_permission_denied-timeout.tape", import.meta.url);

export async function verifyRemoteMcp(origin, fetchImpl = fetch) {
  const root = new URL(origin);
  assert.ok(root.protocol === "https:" || ["localhost", "127.0.0.1"].includes(root.hostname), "Remote MCP must use HTTPS");

  const healthResponse = await fetchImpl(new URL("/health", root));
  assert.equal(healthResponse.status, 200, "GET /health must return 200");
  const health = await healthResponse.json();
  assert.deepEqual(health, { service: "agenttape-remote", version: "0.3.0", status: "ok", storage: "none" });

  for (const path of ["/privacy", "/terms", "/support"]) {
    const response = await fetchImpl(new URL(path, root));
    assert.equal(response.status, 200, `GET ${path} must return 200`);
  }

  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const regression = JSON.parse(await readFile(regressionUrl, "utf8"));
  const client = new Client({ name: "agenttape-production-verifier", version: "0.3.0" });
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", root), { fetch: fetchImpl });

  await client.connect(transport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), expectedTools);

    const validated = await client.callTool({ name: "validate_tape", arguments: { tape: fixture } });
    assert.equal(validated.structuredContent.valid, true);

    const inspected = await client.callTool({ name: "inspect_tape", arguments: { tape: fixture } });
    assert.equal(inspected.structuredContent.run.id, fixture.id);

    const forked = await client.callTool({
      name: "fork_run",
      arguments: {
        tape: fixture,
        boundarySequence: 2,
        targetSequence: 3,
        injection: { kind: "timeout", parameters: { timeoutMs: 5000 } },
      },
    });
    assert.equal(forked.structuredContent.status, "completed");
    assert.equal(forked.structuredContent.evidence.liveToolCalls, 0);

    const asserted = await client.callTool({ name: "run_assertions", arguments: { tape: regression } });
    assert.equal(asserted.structuredContent.passed, true);
    return { origin: root.origin, tools: expectedTools.length, assertions: asserted.structuredContent.summary.total };
  } finally {
    await client.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.argv[2];
  if (!origin) {
    console.error("Usage: npm run verify:http-mcp -- https://your-worker.example");
    process.exitCode = 2;
  } else {
    try {
      const result = await verifyRemoteMcp(origin);
      console.log(`PASS AgentTape remote MCP at ${result.origin}: ${result.tools} tools, ${result.assertions} assertions`);
    } catch (error) {
      console.error(`FAIL AgentTape remote MCP: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
