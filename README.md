# AgentTape

**Turn one failed Codex run into a portable regression test.**

[![CI](https://github.com/jiangkoumo/agenttape/actions/workflows/agenttape.yml/badge.svg)](https://github.com/jiangkoumo/agenttape/actions/workflows/agenttape.yml)
[![Release](https://img.shields.io/github/v/release/jiangkoumo/agenttape)](https://github.com/jiangkoumo/agenttape/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

AgentTape is an open-source, local-first Codex plugin that records supported tool failures as redacted, versioned `.tape` evidence. Inspect what failed, fork the captured run at a controlled boundary, and save the result as an offline regression test that can run in CI without another model call.

Most trace tools help you observe a failure. AgentTape is built to turn that failure into a small, reviewable artifact that prevents the same bug from returning.

```text
Codex tool failure
        ↓
redacted .tape evidence
        ↓
inspect → inject one condition → compare branches
        ↓
save assertions → run offline in CI
```

## Why AgentTape

- **Failure artifact, not another dashboard.** A `.tape` is portable evidence you can inspect, review, share, and commit with a bug fix.
- **Codex-native capture.** Bundled hooks cover the 11 current Codex lifecycle, prompt, compaction, subagent, permission, and local tool events after the user reviews and trusts them—no application instrumentation required.
- **Local and privacy-conscious.** Runtime captures stay inside the active project, and common secret-bearing fields are recursively redacted before export.
- **Controlled failure injection.** Fork recorded evidence with permission-denied, timeout, rate-limited, malformed-JSON, or truncated-response results.
- **Offline regression tests.** Structural replay and assertions use captured evidence with zero model calls and zero live tool calls.
- **Honest replay confidence.** AgentTape reports coverage and limitations instead of claiming every external system can be reproduced bit for bit.

## Install from GitHub

Prerequisites: Codex and Node.js 20 or newer.

```bash
codex plugin marketplace add jiangkoumo/agenttape
codex plugin add agenttape@agenttape
```

Start a new Codex task after installation and review the bundled hooks before trusting them. Captures are then stored under the active project's `.agent-tape/` directory.

## Two-minute workflow

First, use Codex normally until a supported local tool call fails. Then ask:

```text
Use tool search to find AgentTape. List captured runs, inspect the latest
failed run, and explain the first recorded failure and replay confidence.
```

AgentTape exposes four MCP tools:

| Tool | Purpose |
| --- | --- |
| `list_tapes` | Find valid captures in the active workspace |
| `inspect_tape` | Inspect events, failures, redaction, and replay confidence |
| `fork_run` | Inject one supported failure condition at a recorded boundary |
| `save_regression` | Save reviewed assertions under `tests/agenttape/` |

Run a saved regression locally or in CI:

```bash
node plugins/agenttape/dist/agenttape-cli.mjs test tests/agenttape
```

Passing assertions exit with code `0`. Validation or assertion failures exit nonzero, and captured comparison values are omitted from failure output.

The repository CI runs the same directory command through `npm run test:tapes`, so every reviewed `.tape` added under `tests/agenttape/` becomes an offline regression automatically.

## What a `.tape` captures

Tape v1 keeps the evidence needed for structural debugging:

- Run identity, timestamps, source coverage, and explicit limitations.
- Ordered lifecycle, permission, and supported local tool events.
- Tool inputs, outputs, explicit failures, and the first failure boundary.
- A redaction manifest that records where values were removed.
- Optional fork metadata, injected conditions, and structural assertions.
- Replay-confidence inputs so consumers can distinguish strong evidence from playback-only traces.

The tape schema is independent from the UI and recorder implementation. See [Tape Schema v1](./docs/TAPE_SCHEMA_V1.md).

## Regression assertions

AgentTape currently supports deterministic checks for:

- A field equals an expected value.
- A tool is present or absent.
- Tool execution order matches expectations.
- Retry count stays below a maximum.
- The final run status matches the expected status.
- Replay confidence meets a minimum threshold.

Reviewed regression artifacts are written under `tests/agenttape/` and are not overwritten by default.

## Replay boundaries

AgentTape currently provides **structural replay**, not full agent re-execution. It reuses captured state, substitutes one recorded tool result, and stops at the injected boundary. It does not regenerate downstream model reasoning.

Hosted tools, uncaptured external state, and changes in third-party systems may be absent. A redaction marker proves that AgentTape's redactor ran; it cannot prove arbitrary free-form text contains no secret. Review every `.tape` before sharing it.

See [Privacy](./docs/PRIVACY.md) and [Security](./SECURITY.md) for the complete trust boundary.

## Repository layout

```text
plugins/agenttape/
  .codex-plugin/plugin.json   # Codex plugin manifest
  hooks/hooks.json            # Recorder lifecycle hooks
  skills/capture-failure/     # Guided capture workflow
  dist/mcp-server.mjs         # Self-contained bundled MCP server
  scripts/                    # Recorder, schema, and assertion CLI
  schemas/                    # Versioned .tape schema
```

The repository also contains an optional Branch Canvas prototype under `src/` and an experimental stateless HTTP MCP under `remote/`. They exercise the same tape and replay concepts but are not required to install or use the Codex plugin.

## Local development

```bash
git clone https://github.com/jiangkoumo/agenttape.git
cd agenttape
npm ci
npm run test:plugin-release
npm run build:plugin
codex plugin marketplace add .
codex plugin add agenttape@agenttape
```

The committed `plugins/agenttape/dist/mcp-server.mjs` allows marketplace installs to run without building the repository. Rebuild and commit it whenever MCP source changes.

Run `npm test` and `npm run build` when changing the optional Branch Canvas, Sites adapter, or remote HTTP MCP surfaces.

## Uninstall

```bash
codex plugin remove agenttape@agenttape
codex plugin marketplace remove agenttape
```

## Contributing

Issues and pull requests are welcome. See [Contributing](./CONTRIBUTING.md), [Code of Conduct](./CODE_OF_CONDUCT.md), and [Changelog](./CHANGELOG.md).

## License

MIT. See [LICENSE](./LICENSE).
