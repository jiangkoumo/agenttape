import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { inspectTape } from "../plugins/agenttape/mcp/tape-access.mjs";
import { structuralReplay } from "../plugins/agenttape/replay/structural-replay.mjs";
import { validateTape } from "../plugins/agenttape/scripts/tape-schema.mjs";
import { recordHook } from "../plugins/agenttape/scripts/tape-store.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(projectRoot, "plugins", "agenttape");
const recorder = path.join(pluginRoot, "scripts", "record-hook.mjs");
const cli = path.join(pluginRoot, "scripts", "agenttape.mjs");
const verifier = path.join(pluginRoot, "scripts", "verify-capture.mjs");

function runHook(cwd, payload, extraEnv = {}) {
  const result = spawnSync(process.execPath, [recorder], {
    cwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv, PLUGIN_ROOT: pluginRoot },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
}

async function waitForPath(file) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await stat(file);
      return;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(1);
  }
  throw new Error(`Timed out waiting for ${file}`);
}

test("registers every currently supported Codex lifecycle hook", async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.hooks).sort(), [
    "PermissionRequest",
    "PostCompact",
    "PostToolUse",
    "PreCompact",
    "PreToolUse",
    "SessionEnd",
    "SessionStart",
    "Stop",
    "SubagentStart",
    "SubagentStop",
    "UserPromptSubmit",
  ]);
});

test("records prompt, compaction, and subagent lifecycle details without leaking secrets or transcript paths", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-hooks-"));

  try {
    const common = {
      session_id: "session-hook-coverage",
      turn_id: "turn-hook-coverage",
      transcript_path: "/private/transcripts/main.jsonl",
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    runHook(workspace, { ...common, hook_event_name: "SessionStart", source: "startup" });
    runHook(workspace, {
      ...common,
      hook_event_name: "UserPromptSubmit",
      prompt: "Reproduce with Authorization: Bearer hook-secret-token",
    });
    runHook(workspace, { ...common, hook_event_name: "PreCompact", trigger: "auto" });
    runHook(workspace, { ...common, hook_event_name: "PostCompact", trigger: "auto" });
    runHook(workspace, {
      ...common,
      hook_event_name: "SubagentStart",
      agent_id: "agent-1",
      agent_type: "worker",
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "SubagentStop",
      agent_id: "agent-1",
      agent_type: "worker",
      agent_transcript_path: "/private/transcripts/agent-1.jsonl",
      stop_hook_active: false,
      last_assistant_message: "token=agent-secret-value",
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "Finished with password=turn-secret-value",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tapeText = await readFile(path.join(tapeDirectory, name), "utf8");
    const tape = JSON.parse(tapeText);

    assert.equal(validateTape(tape), tape);
    assert.deepEqual(tape.events.map((event) => event.type), [
      "SessionStart",
      "UserPromptSubmit",
      "PreCompact",
      "PostCompact",
      "SubagentStart",
      "SubagentStop",
      "Stop",
    ]);
    assert.equal(tape.events[1].details.prompt, "Reproduce with Authorization: Bearer [REDACTED]");
    assert.equal(tape.events[2].details.trigger, "auto");
    assert.equal(tape.events[4].details.agent_id, "agent-1");
    assert.equal(tape.events[5].details.agent_transcript_available, true);
    assert.doesNotMatch(tapeText, /hook-secret-token|agent-secret-value|turn-secret-value|private\/transcripts/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("serializes concurrent hook writers into one complete event sequence", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-concurrent-"));

  try {
    const common = {
      session_id: "session-concurrent",
      turn_id: "turn-concurrent",
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };
    await Promise.all(Array.from({ length: 24 }, (_, index) => recordHook({
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: `tool-${index}`,
      tool_input: { command: `printf ${index}` },
    })));
    await recordHook({
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "Concurrent hooks complete.",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tape = JSON.parse(await readFile(path.join(tapeDirectory, name), "utf8"));
    assert.equal(validateTape(tape), tape);
    assert.equal(tape.events.length, 25);
    assert.deepEqual(tape.events.map((event) => event.sequence), Array.from({ length: 25 }, (_, index) => index + 1));
    assert.equal(new Set(tape.events.slice(0, -1).map((event) => event.tool.useId)).size, 24);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("keeps a transcript-delayed PostToolUse in the Stop tape", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-stop-race-"));

  try {
    const transcriptPath = path.join(workspace, "rollout.jsonl");
    const common = {
      session_id: "session-stop-race",
      turn_id: "turn-stop-race",
      transcript_path: transcriptPath,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    await recordHook({ ...common, hook_event_name: "SessionStart", source: "startup" });
    await recordHook({
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-stop-race",
      tool_input: { command: "printf done", token: "post-race-input-secret" },
    });

    const post = recordHook({
      ...common,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-stop-race",
      tool_input: { command: "printf done" },
      tool_response: { exit_code: 0, output: "token=post-race-output-secret" },
    });
    await waitForPath(path.join(workspace, ".agent-tape", "runtime", "session-stop-race.jsonl.lock"));

    const stop = recordHook({
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "The command completed.",
    });
    await writeFile(transcriptPath, `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: {
          type: "CommandExecution",
          id: "tool-stop-race",
          status: "completed",
          exit_code: 0,
        },
      },
    })}\n`);
    await Promise.all([post, stop]);
    await recordHook({ ...common, hook_event_name: "SessionEnd", reason: "other" });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const names = await readdir(tapeDirectory);
    assert.equal(names.length, 1);
    const tapeText = await readFile(path.join(tapeDirectory, names[0]), "utf8");
    const tape = JSON.parse(tapeText);
    const postEvent = tape.events.find((event) => event.type === "PostToolUse");
    assert.equal(validateTape(tape), tape);
    assert.deepEqual(tape.events.map((event) => event.type), ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]);
    assert.deepEqual(postEvent.tool.output, { exit_code: 0, output: "token=[REDACTED]" });
    assert.deepEqual(postEvent.details.execution, { status: "completed", exitCode: 0 });
    assert.equal(postEvent.details.terminationEvidence, undefined);
    assert.doesNotMatch(tapeText, /post-race-input-secret|post-race-output-secret/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("reconciles a transcript-confirmed tool failure when PostToolUse is missing", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-missing-post-"));

  try {
    const transcriptPath = path.join(workspace, "rollout.jsonl");
    await writeFile(transcriptPath, `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: {
          type: "McpToolCall",
          id: "tool-denied-1",
          status: "failed",
          result: {
            content: [{
              type: "text",
              text: "ToolFence denied this tool call (rule: ask-dogfood-marker): Approval timed out; token=transcript-secret-value",
            }],
            isError: true,
          },
        },
      },
    })}\n`);
    const common = {
      session_id: "session-missing-post",
      turn_id: "turn-missing-post",
      transcript_path: transcriptPath,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    await recordHook({ ...common, hook_event_name: "SessionStart", source: "startup" });
    await recordHook({
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "mcp__dogfood_shell_deny__execute_command",
      tool_use_id: "tool-denied-1",
      tool_input: {
        command: "cat .agent-tape/runtime/dogfood/run/.env",
        authorization: "Bearer missing-post-hook-secret",
      },
    });
    await recordHook({
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "The tool call was denied.",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tapeText = await readFile(path.join(tapeDirectory, name), "utf8");
    const tape = JSON.parse(tapeText);
    assert.equal(validateTape(tape), tape);
    assert.equal(tape.status, "failed");
    assert.equal(tape.summary.toolCallCount, 1);
    assert.equal(tape.summary.failedToolCallCount, 1);
    assert.deepEqual(tape.events.map((event) => event.type), ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]);
    const terminalEvent = tape.events[2];
    assert.equal(terminalEvent.tool.name, "mcp__dogfood_shell_deny__execute_command");
    assert.equal(terminalEvent.tool.useId, "tool-denied-1");
    assert.equal(terminalEvent.tool.failed, true);
    assert.equal(terminalEvent.tool.failure.kind, "timeout");
    assert.equal(terminalEvent.tool.failure.reason, "The recorded approval request timed out.");
    assert.deepEqual(terminalEvent.tool.output, {
      status: "failed",
      error: {
        code: "TIMEOUT",
        message: "The recorded approval request timed out.",
      },
    });
    assert.deepEqual(terminalEvent.details.terminationEvidence, {
      source: "codex-transcript",
      postToolUseObserved: false,
      status: "failed",
    });

    const inspected = inspectTape(tape);
    assert.equal(inspected.replayConfidence.score, 0.4);
    assert.equal(inspected.replayConfidence.level, "low");
    assert.equal(inspected.replayConfidence.inputs.capturedToolResults, false);
    assert.match(inspected.replayConfidence.reasons.join(" "), /tool results were not captured/);
    assert.match(inspected.replayConfidence.reasons.join(" "), /supported-local-hooks/);

    const forked = structuralReplay(tape, {
      boundarySequence: 2,
      targetSequence: 3,
      injection: { kind: "permission_denied" },
    });
    assert.equal(forked.status, "completed");
    assert.equal(forked.evidence.modelCallsBeforeFork, 0);
    assert.equal(forked.evidence.liveToolCalls, 0);
    assert.equal(forked.confidence.score, 0.4);
    assert.equal(forked.confidence.level, "low");
    assert.equal(forked.confidence.inputs.capturedToolResults, false);
    assert.equal(forked.branch.targetSequence, 3);
    assert.doesNotMatch(tapeText, /ask-dogfood-marker|transcript-secret-value|missing-post-hook-secret/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("classifies transcript policy denials and non-result timeouts without copying diagnostics", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-transcript-terminal-"));

  try {
    const transcriptPath = path.join(workspace, "rollout.jsonl");
    await writeFile(transcriptPath, [
      {
        type: "event_msg",
        payload: {
          type: "item_completed",
          item: {
            type: "McpToolCall",
            id: "tool-policy-denied",
            status: "failed",
            error: { message: "ToolFence denied this tool call (rule: deny-write); token=policy-diagnostic-secret" },
          },
        },
      },
      {
        type: "event_msg",
        payload: {
          type: "item_completed",
          item: {
            type: "CommandExecution",
            id: "tool-status-timeout",
            status: "failed",
            error_message: "Timed out waiting for execution; token=timeout-diagnostic-secret",
          },
        },
      },
    ].map((row) => JSON.stringify(row)).join("\n"));
    const common = {
      session_id: "session-transcript-terminal",
      turn_id: "turn-transcript-terminal",
      transcript_path: transcriptPath,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    await recordHook({ ...common, hook_event_name: "SessionStart", source: "startup" });
    await recordHook({
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "mcp__dogfood_policy__execute",
      tool_use_id: "tool-policy-denied",
      tool_input: { request: "policy" },
    });
    await recordHook({
      ...common,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_use_id: "tool-status-timeout",
      tool_input: { command: "sleep 1" },
    });
    await recordHook({
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "Both commands terminated.",
    });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tapeText = await readFile(path.join(tapeDirectory, name), "utf8");
    const tape = JSON.parse(tapeText);
    assert.equal(validateTape(tape), tape);
    const terminalEvents = tape.events.filter((event) => event.type === "PostToolUse");
    assert.equal(terminalEvents.length, 2);
    assert.equal(terminalEvents.find((event) => event.tool.useId === "tool-policy-denied").tool.failure.kind, "permission_denied");
    assert.equal(terminalEvents.find((event) => event.tool.useId === "tool-status-timeout").tool.failure.kind, "timeout");
    assert.doesNotMatch(tapeText, /policy-diagnostic-secret|timeout-diagnostic-secret/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

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

    const verifyResult = spawnSync(process.execPath, [
      verifier,
      "--root", workspace,
      "--must-fail",
      "--require-redaction",
      "--require-event", "SessionStart",
      "--require-event", "PostToolUse",
      "--require-event", "Stop",
    ], {
      cwd: workspace,
      encoding: "utf8",
      env: { PATH: process.env.PATH || "" },
    });
    assert.equal(verifyResult.status, 0, verifyResult.stderr);
    const verification = JSON.parse(verifyResult.stdout);
    assert.equal(verification.passed, true);
    assert.equal(verification.obviousSecretPresent, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("uses the real Codex transcript exit code when PostToolUse output omits process status", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-transcript-"));

  try {
    const codexHome = path.join(workspace, "codex-home");
    const date = new Date();
    const transcriptDirectory = path.join(
      codexHome,
      "sessions",
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    );
    await mkdir(transcriptDirectory, { recursive: true });
    const transcript = path.join(transcriptDirectory, "rollout-test-session-transcript.jsonl");
    await writeFile(transcript, `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: {
          type: "CommandExecution",
          id: "exec-real-shape",
          status: "failed",
          exit_code: 7,
          aggregated_output: "Intentional failure output",
        },
      },
    })}\n`);
    const common = {
      session_id: "session-transcript",
      turn_id: "turn-transcript",
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    runHook(workspace, {
      ...common,
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_use_id: "exec-real-shape",
      tool_input: { command: "npm test" },
      tool_response: "Intentional failure output",
    }, { CODEX_HOME: codexHome });
    runHook(workspace, {
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "The process exited with 7.",
    }, { CODEX_HOME: codexHome });

    const tapeDirectory = path.join(workspace, ".agent-tape", "tapes");
    const [name] = await readdir(tapeDirectory);
    const tape = JSON.parse(await readFile(path.join(tapeDirectory, name), "utf8"));
    const toolEvent = tape.events.find((event) => event.type === "PostToolUse");
    assert.equal(validateTape(tape), tape);
    assert.equal(tape.status, "failed");
    assert.equal(toolEvent.tool.failed, true);
    assert.equal(toolEvent.tool.failure.reason, "Codex recorded tool exit code 7");
    assert.deepEqual(toolEvent.details.execution, { status: "failed", exitCode: 7 });
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

test("does not treat nested failure evidence returned by a successful inspection as the current tool failure", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "agenttape-plugin-"));

  try {
    const common = {
      session_id: "session-nested-failure-evidence",
      turn_id: "turn-nested-failure-evidence",
      transcript_path: null,
      cwd: workspace,
      model: "test-model",
      permission_mode: "default",
    };

    runHook(workspace, {
      ...common,
      hook_event_name: "PostToolUse",
      tool_name: "mcp__agenttape_fenced__inspect_tape",
      tool_use_id: "tool-nested-failure-evidence",
      tool_input: { id: "tape_failed_source" },
      tool_response: {
        content: [{ type: "text", text: "tape_failed_source is failed with 1 recorded failure." }],
        structuredContent: {
          run: { id: "tape_failed_source", status: "failed" },
          failures: [{ kind: "permission_denied", reason: "Permission denied" }],
        },
      },
    });
    runHook(workspace, {
      ...common,
      hook_event_name: "Stop",
      stop_hook_active: false,
      last_assistant_message: "The inspection succeeded.",
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
