import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  AgentTapeAccessError,
  MAX_TAPE_BYTES,
  inspectWorkspaceTape,
  listWorkspaceTapes,
} from "../plugins/agenttape/mcp/tape-access.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(projectRoot, "plugins", "agenttape");
const fixtureRoot = path.join(pluginRoot, "fixtures");
const bundledServer = path.join(pluginRoot, "dist", "mcp-server.mjs");

async function fixtureWorkspace(names = ["permission-denied.tape", "timeout.tape"]) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-mcp-"));
  const tapes = path.join(workspace, ".agent-tape", "tapes");
  await mkdir(tapes, { recursive: true });
  for (const name of names) await copyFile(path.join(fixtureRoot, name), path.join(tapes, name));
  return workspace;
}

test("lists and inspects only valid tapes in the active workspace", async () => {
  const workspace = await fixtureWorkspace();
  try {
    const listed = await listWorkspaceTapes(workspace, 1);
    assert.equal(listed.tapes.length, 1);
    assert.equal(listed.truncated, true);
    assert.equal(listed.warnings.length, 0);
    assert.equal(listed.tapes[0].failedToolCallCount, 1);

    const inspected = await inspectWorkspaceTape(workspace, "tape_fixture_permission_denied");
    assert.equal(inspected.run.source.coverage, "supported-local-hooks");
    assert.equal(inspected.failures[0].kind, "permission_denied");
    assert.equal(inspected.replayConfidence.score, 0.65);
    assert.equal(inspected.redaction.applied, true);
    assert.equal("cwd" in inspected.run.source, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects directory escape and reports symlink, oversized, and invalid tape files", async () => {
  const outside = await fixtureWorkspace(["permission-denied.tape"]);
  const escaped = await mkdtemp(path.join(os.tmpdir(), "agenttape-escaped-"));
  try {
    await mkdir(path.join(escaped, ".agent-tape"), { recursive: true });
    await symlink(path.join(outside, ".agent-tape", "tapes"), path.join(escaped, ".agent-tape", "tapes"));
    await assert.rejects(
      () => listWorkspaceTapes(escaped),
      (error) => error instanceof AgentTapeAccessError && error.code === "PATH_OUTSIDE_WORKSPACE",
    );

    const tapes = path.join(outside, ".agent-tape", "tapes");
    await symlink(path.join(fixtureRoot, "timeout.tape"), path.join(tapes, "linked.tape"));
    await writeFile(path.join(tapes, "large.tape"), "x".repeat(MAX_TAPE_BYTES + 1));
    await writeFile(path.join(tapes, "invalid.tape"), "{not-json");

    const listed = await listWorkspaceTapes(outside);
    assert.deepEqual(
      listed.warnings.map((warning) => warning.code).sort(),
      ["MALFORMED_TAPE_JSON", "TAPE_TOO_LARGE", "UNSAFE_FILE_TYPE"],
    );
  } finally {
    await rm(outside, { recursive: true, force: true });
    await rm(escaped, { recursive: true, force: true });
  }
});

test("serves list_tapes and inspect_tape over the bundled stdio MCP server", async () => {
  const workspace = await fixtureWorkspace(["permission-denied.tape"]);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bundledServer],
    cwd: pluginRoot,
    env: { PATH: process.env.PATH || "", PWD: workspace },
    stderr: "pipe",
  });
  const client = new Client({ name: "agenttape-integration-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name).sort(),
      ["fork_run", "inspect_tape", "list_tapes", "save_regression"],
    );
    for (const tool of tools.tools) {
      assert.equal(tool.annotations.readOnlyHint, tool.name !== "save_regression");
      assert.equal(tool.annotations.destructiveHint, false);
      assert.equal(tool.annotations.openWorldHint, false);
      assert.ok(tool.inputSchema);
      assert.ok(tool.outputSchema);
    }
    const listSchema = tools.tools.find((tool) => tool.name === "list_tapes").inputSchema;
    assert.deepEqual(Object.keys(listSchema.properties), ["limit", "workspaceRoot"]);
    assert.ok(!(listSchema.required || []).includes("workspaceRoot"));

    const listed = await client.callTool({ name: "list_tapes", arguments: { limit: 10 } });
    assert.equal(listed.isError, undefined);
    assert.equal(listed.structuredContent.tapes[0].id, "tape_fixture_permission_denied");

    const inspected = await client.callTool({
      name: "inspect_tape",
      arguments: { id: "tape_fixture_permission_denied" },
    });
    assert.equal(inspected.isError, undefined);
    assert.equal(inspected.structuredContent.failures[0].kind, "permission_denied");

    const forked = await client.callTool({
      name: "fork_run",
      arguments: {
        id: "tape_fixture_permission_denied",
        boundarySequence: 2,
        targetSequence: 3,
        injection: "timeout",
      },
    });
    assert.equal(forked.structuredContent.status, "completed");
    assert.equal(forked.structuredContent.evidence.modelCallsBeforeFork, 0);

    const saved = await client.callTool({
      name: "save_regression",
      arguments: {
        id: "tape_fixture_permission_denied",
        boundarySequence: 2,
        targetSequence: 3,
        injection: "timeout",
        filename: "permission-timeout.tape",
      },
    });
    assert.equal(saved.isError, undefined);
    assert.equal(saved.structuredContent.path, "tests/agenttape/permission-timeout.tape");
    const regression = path.join(workspace, saved.structuredContent.path);
    const testResult = spawnSync(process.execPath, [
      path.join(pluginRoot, "scripts", "agenttape.mjs"),
      "test",
      regression,
    ], { cwd: workspace, encoding: "utf8", env: { PATH: process.env.PATH || "" } });
    assert.equal(testResult.status, 0, testResult.stderr);

    const duplicate = await client.callTool({
      name: "save_regression",
      arguments: {
        id: "tape_fixture_permission_denied",
        boundarySequence: 2,
        targetSequence: 3,
        injection: "timeout",
        filename: "permission-timeout.tape",
      },
    });
    assert.equal(duplicate.isError, true);
    assert.match(duplicate.content[0].text, /REGRESSION_EXISTS/);

    const invalid = await client.callTool({ name: "inspect_tape", arguments: { id: "../../outside" } });
    assert.equal(invalid.isError, true);
    assert.match(invalid.content[0].text, /Invalid arguments/);
  } finally {
    await client.close();
    await rm(workspace, { recursive: true, force: true });
  }
});

test("packages the MCP server in the plugin manifest", async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  const config = JSON.parse(await readFile(path.join(pluginRoot, ".mcp.json"), "utf8"));
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(config.mcpServers.agenttape.cwd, ".");
  assert.deepEqual(config.mcpServers.agenttape.args, ["./dist/mcp-server.mjs"]);
  assert.deepEqual(config.mcpServers.agenttape.env_vars, ["CODEX_CWD", "PWD"]);
  assert.ok((await readFile(bundledServer, "utf8")).startsWith("#!/usr/bin/env node\n"));
});
