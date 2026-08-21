# AgentTape

AgentTape is a local-first Codex plugin for turning captured tool failures into redacted, versioned `.tape` evidence and executable offline regression tests.

It records supported Codex hook events, exposes workspace captures through four MCP tools, creates deterministic structural forks without model or live-tool calls, and lets the Branch Canvas save a validated branch under `tests/agenttape/`.

## What works

- Redacted version 1 `.tape` capture and JSON Schema validation.
- `list_tapes`, `inspect_tape`, `fork_run`, and `save_regression` MCP tools.
- Structural result substitution for permission denied, timeout, malformed JSON, and truncated response conditions.
- Offline assertions with meaningful CLI exit codes.
- A real local Branch Canvas plus a generated, read-only public demo mode.
- Repository-local Codex marketplace packaging.
- A separately deployable Streamable HTTP MCP server for stateless processing of caller-supplied redacted tapes.

AgentTape does not claim bit-exact replay. Hosted tools, uncaptured external state, and downstream model reasoning remain outside structural replay coverage.

## Hosted demo

The redacted, read-only Branch Canvas is deployed at [agenttape.jiangkoumo.chatgpt.site](https://agenttape.jiangkoumo.chatgpt.site). The first release is owner-only; it never reads or writes a visitor's local workspace.

## Remote MCP release candidate

The Cloudflare Worker under `remote/` exposes `validate_tape`, `inspect_tape`, `fork_run`, and `run_assertions` at `/mcp`. It accepts only explicit AgentTape v1 documents with `redactions.applied: true`, limits requests and tapes to roughly 1 MiB, stores nothing, and performs no model or live-tool calls.

```bash
npm run test:http-mcp
npm run build:http-mcp
```

Production deployment requires an authenticated Cloudflare account. See [Remote MCP architecture](./docs/REMOTE_MCP.md) and the [plugin submission packet](./docs/PLUGIN_SUBMISSION.md).

## Install locally

Build and register the repository marketplace:

```bash
npm ci
npm run build
codex plugin marketplace add .
codex plugin add agenttape@personal
```

Start a new Codex task in this repository after reviewing and trusting the bundled hooks. Captures are written under `.agent-tape/`, which is ignored by Git.

## Try the offline demo

```bash
npm run demo
```

The demo seeds a redacted fixture only when no file with the same name exists. The local UI then exercises the same list, inspect, fork, and save logic used by the MCP server.

## Run a regression

```bash
node plugins/agenttape/scripts/agenttape.mjs test \
  tests/agenttape/fixture_permission_denied-timeout.tape
```

Passing assertions exit with code `0`; validation or assertion failures exit non-zero and redact compared values.

## Verify the release

```bash
npm test
npm run build
```

See [Phase 2 status](./docs/DEVELOPMENT_STATUS.md), the [version 1 tape contract](./docs/TAPE_SCHEMA_V1.md), [security policy](./SECURITY.md), and [privacy notes](./docs/PRIVACY.md).

## License

MIT. See [LICENSE](./LICENSE).
