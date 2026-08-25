---
name: capture-failure
description: Turn a captured Codex tool failure into reviewed .tape evidence and an offline regression test. Use when the user asks to inspect a failed run, fork captured evidence, save a regression, or prepare AgentTape evidence for CI.
---

# Capture a Codex failure with AgentTape

AgentTape hooks record supported local Codex tool events into the current project's `.agent-tape/` directory after the plugin hooks have been reviewed and trusted.

## Workflow

1. Use `list_tapes` to find captures in the active project. If none exists, explain that recording starts in a new Codex task after the plugin and its hooks are trusted. Do not invent a run.
2. Use `inspect_tape` on the latest failed capture. Report the first explicit failure, redaction status, replay confidence, and recorded coverage limitations before proposing a fork.
3. Choose one supported condition to change: `permission_denied`, `timeout`, `rate_limited`, `malformed_json`, or `truncated_response`. Use `fork_run` at a recorded boundary and confirm that it made zero model calls and zero live tool calls.
4. Ask for confirmation only if the intended assertion or injection is materially ambiguous. Otherwise use `save_regression` with at least one meaningful assertion and a descriptive `.tape` filename. It writes under `tests/agenttape/` and does not overwrite by default.
5. Resolve `../../dist/agenttape-cli.mjs` relative to this `SKILL.md`. From the user's project directory, run `node <absolute-cli-path> test tests/agenttape` so every saved regression executes exactly as CI will execute it. The bundled CLI is self-contained; do not invoke source scripts from an installed plugin cache.
6. Report the saved relative path, assertions executed, pass/fail result, and the structural replay limitations.

If the user only wants the raw captured artifact, resolve the same bundled CLI and run `node <absolute-cli-path> export latest --output <path>` instead of creating a structural regression.

## Boundaries

- Treat the tape as redacted structural evidence, not bit-exact replay.
- Never claim that hosted tools were captured. Phase 1 covers tool paths delivered through Codex local hooks.
- Never include `.agent-tape/runtime/` in a commit. Commit only reviewed artifacts under `tests/agenttape/`.
- Do not modify the captured tape by hand. Re-run or export it again if the source evidence changes.
