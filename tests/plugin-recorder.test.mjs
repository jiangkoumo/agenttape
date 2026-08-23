import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateTape } from "../plugins/agenttape/scripts/tape-schema.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(projectRoot, "plugins", "agenttape");
const recorder = path.join(pluginRoot, "scripts", "record-hook.mjs");
const cli = path.join(pluginRoot, "scripts", "agenttape.mjs");

function runHook(cwd, payload) {
  const result = spawnSync(process.execPath, [recorder], {
    cwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, PLUGIN_ROOT: pluginRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
}

test("captures a failed Codex turn and exports a redacted version 1 tape", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-plugin-"));

  try {
    const common = {
      session_id: "session-test-1",
      turn_id: "turn-test-1",
      transcript_path: null,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    runHook(workspace, { ...common, hook_event_name: "SessionStart", source: "startup" });
    runHook(workspace, {
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-1",
      tool_input: {
        command: "npm test",
        env: { OPENAI_API_KEY: "sk-super-secret-token" },
      },
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-1",
      tool_input: { command: "npm test" },
      tool_response: { exit_code: 1, output: "1 test failed" },
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "The test failed.",
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "SessionEnd",
      reason: "other",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const names = await readdir(tapeDirectory);
    assert.equal(names.length, 1);

    const tapeText = await readFile(path.join(tapeDirectory, names[0]), "utf8");
    const tape = JSON.parse(tapeText);
    assert.equal(validateTape(tape), tape);
    assert.equal(tape.format, "agenttape.tape");
    assert.equal(tape.version, 1);
    assert.equal(tape.status, "failed");
    assert.equal(tape.summary.toolCallCount, 1);
    assert.equal(tape.summary.failedToolCallCount, 1);
    assert.equal(tape.events.find((event) => event.type === "PostToolUse").tool.failed, true);
    assert.doesNotMatch(tapeText, /sk-super-secret-token/);
    assert.match(tapeText, /\[REDACTED\]/);

    const list = spawnSync(process.execPath, [cli, "list", "--json"], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.equal(list.status, 0, list.stderr);
    const summaries = JSON.parse(list.stdout);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].firstFailure.toolName, "Bash");

    const exported = path.join(workspace, "tests", "failure.tape");
    const exportResult = spawnSync(process.execPath, [cli, "export", "latest", "--output", exported], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.equal(exportResult.status, 0, exportResult.stderr);
    assert.deepEqual(JSON.parse(await readFile(exported, "utf8")), tape);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("does not classify a successful HTTP-style status code as a tool failure", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-plugin-"));

  try {
    const common = {
      session_id: "session-test-2",
      turn_id: "turn-test-2",
      transcript_path: null,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    runHook(workspace, {
      ...common,
      hook_event_name: "PostToolUse",
      tool_name: "mcp__example__fetch",
      tool_use_id: "tool-2",
      tool_input: { resource: "example" },
      tool_response: { status_code: 200, status: "success" },
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "The request succeeded.",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tape = JSON.parse(await readFile(path.join(tapeDirectory, name), "utf8"));
    assert.equal(tape.status, "captured");
    assert.equal(tape.summary.failedToolCallCount, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("does not classify exit_code: undefined or zero as a tool failure", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-plugin-"));

  try {
    const common = {
      session_id: "session-test-3",
      turn_id: "turn-test-3",
      transcript_path: null,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    runHook(workspace, {
      ...common,
      hook_event_name: "PostToolUse",
      tool_name: "mcp__example__run",
      tool_use_id: "tool-3",
      tool_input: { task: "build" },
      tool_response: { exit_code: undefined, status: "completed" },
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "Build finished.",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tape = JSON.parse(await readFile(path.join(tapeDirectory, name), "utf8"));
    assert.equal(tape.status, "captured");
    assert.equal(tape.summary.failedToolCallCount, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("listTapes ignores corrupted tape files and CLI summarize handles missing failure object", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-plugin-"));

  try {
    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    await mkdir(tapeDirectory, { recursive: true });

    // Valid tape with failed: true but no failure object
    const validTape = {
      format: "agenttape.tape",
      version: 1,
      id: "tape_test_nofailureobj",
      status: "failed",
      capturedAt: "2026-08-23T12:00:00.000Z",
      completedAt: "2026-08-23T12:01:00.000Z",
      source: {
        adapter: "codex-hooks",
        sessionId: "session-test",
        cwd: workspace,
        coverage: "supported-local-hooks",
      },
      summary: {
        eventCount: 1,
        toolCallCount: 1,
        failedToolCallCount: 1,
      },
      limitations: ["test"],
      events: [{
        sequence: 1,
        recordedAt: "2026-08-23T12:00:00.000Z",
        type: "PostToolUse",
        tool: {
          name: "Bash",
          failed: true,
        },
      }],
    };

    await writeFile(path.join(tapeDirectory, "valid.tape"), JSON.stringify(validTape));
    await writeFile(path.join(tapeDirectory, "corrupted.tape"), "invalid-json-content");

    const { listTapes } = await import("../plugins/agenttape/scripts/tape-store.mjs");
    const tapes = await listTapes(workspace);
    assert.equal(tapes.length, 1);
    assert.equal(tapes[0].tape.id, "tape_test_nofailureobj");

    const listResult = spawnSync(process.execPath, [cli, "list", "--json"], {
      cwd: workspace,
      encoding: "utf8",
    });
    assert.equal(listResult.status, 0, listResult.stderr);
    const summaries = JSON.parse(listResult.stdout);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0].firstFailure.reason, "Recorded tool failure");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
