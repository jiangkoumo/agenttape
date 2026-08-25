# AgentTape Plugin

AgentTape is an open-source, local-first Codex plugin that records supported lifecycle and tool events, marks explicit tool failures, emits a redacted version 1 `.tape`, and turns deterministic structural branches into executable regressions. It does not require a hosted service.

Install it from the repository marketplace with `codex plugin marketplace add jiangkoumo/agenttape`, followed by `codex plugin add agenttape@agenttape`.

## Included

- Codex hooks for `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, and `Stop`.
- Recursive redaction for common secret-bearing fields.
- Serialized runtime writes so concurrent hooks preserve one complete event sequence.
- Per-turn captures under `.agent-tape/tapes/`.
- The `capture-failure` skill and offline `agenttape.mjs` CLI.
- Version 1 JSON Schema and fixed permission-denied, timeout, and malformed-JSON fixtures.
- Bundled stdio MCP tools: `list_tapes`, `inspect_tape`, `fork_run`, and `save_regression`.
- Recorded-result substitution for five supported failure conditions.
- Assertions for field equality, tool presence/absence, tool order, retry limits, final status, and replay confidence.

## Storage

Runtime data stays inside the active project:

```text
.agent-tape/
  runtime/
  tapes/
```

Intentional regression artifacts are written under `tests/agenttape/` and can be committed after review.

## CLI

```bash
node scripts/agenttape.mjs list --json
node scripts/agenttape.mjs validate fixtures/permission-denied.tape
node scripts/agenttape.mjs test tests/agenttape
node scripts/verify-capture.mjs --must-fail --require-redaction --require-event PostToolUse
```

## MCP behavior

The server resolves the active project from MCP roots when supported, then from the Codex `CODEX_CWD`/`PWD` environment. A caller may provide an absolute `workspaceRoot` only as a compatibility fallback. Tape reads stay under `.agent-tape/tapes`; regression writes stay under `tests/agenttape` and do not overwrite by default.

## Boundaries

Structural replay reuses recorded state and substitutes one captured tool result. It stops at that injected result and does not regenerate downstream reasoning. AgentTape does not capture hosted tools and does not claim bit-exact, complete, or hermetic replay when external state is absent.
