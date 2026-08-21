---
name: capture-failure
description: Inspect, list, or export Codex tool traces captured by AgentTape. Use when the user asks to record a failure, inspect the latest failed run, save a run as a .tape file, or prepare failure evidence for a regression test.
---

# Capture a Codex failure with AgentTape

AgentTape hooks record supported local Codex tool events into the current project's `.agent-tape/` directory after the plugin hooks have been reviewed and trusted.

## Workflow

1. Resolve `../../scripts/agenttape.mjs` relative to this `SKILL.md`, then use its absolute path for every command below.
2. Run `node <absolute-script-path> latest --json` from the user's project directory.
3. If no capture exists, explain that AgentTape begins recording in a new Codex task after the plugin is installed and its hooks are trusted. Do not invent a run.
4. To list captures, run `node <absolute-script-path> list --json` and summarize status, tool count, failure count, and capture time.
5. To save evidence, choose the user-provided output path. If none was provided, use `tests/<short-purpose>.tape`. Run `node <absolute-script-path> export latest --output <path>`.
6. Read the exported tape and report its status, first failed tool event, and recorded coverage limitations.

## Boundaries

- Treat the tape as redacted structural evidence, not bit-exact replay.
- Never claim that hosted tools were captured. Phase 1 covers tool paths delivered through Codex local hooks.
- Never include `.agent-tape/runtime/` in a commit. Export intentional regression artifacts to a tracked path such as `tests/`.
- Do not modify the captured tape by hand. Re-run or export it again if the source evidence changes.
