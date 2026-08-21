# AgentTape

AgentTape is an open-source, local-first Codex plugin for turning captured tool failures into redacted, versioned `.tape` evidence and executable offline regression tests.

The Codex plugin under `plugins/agenttape/` is the product. It works locally through Codex hooks, a bundled stdio MCP server, and a capture skill. No website, Cloudflare account, or hosted service is required.

## Install from GitHub

Prerequisites: Codex and Node.js 20 or newer.

```bash
codex plugin marketplace add jiangkoumo/agenttape
codex plugin add agenttape@agenttape
```

Start a new Codex task after installation, review and trust the bundled hooks, then ask Codex to list or inspect AgentTape captures. Runtime data stays in the active project under `.agent-tape/`.

To remove it:

```bash
codex plugin remove agenttape@agenttape
codex plugin marketplace remove agenttape
```

## What it does

- Records supported Codex lifecycle, permission, and tool events.
- Recursively redacts common secret-bearing fields before exporting tape v1.
- Marks explicit tool failures and calculates replay confidence.
- Provides `list_tapes`, `inspect_tape`, `fork_run`, and `save_regression` MCP tools.
- Structurally substitutes recorded permission-denied, timeout, malformed-JSON, and truncated-response results.
- Runs offline assertions with meaningful CLI exit codes.
- Saves reviewed regression artifacts under `tests/agenttape/` without overwriting by default.

AgentTape does not claim bit-exact or complete replay. Hosted tools, uncaptured external state, and downstream model reasoning remain outside local hook coverage.

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

The committed `plugins/agenttape/dist/mcp-server.mjs` lets normal marketplace installs run without a repository build. Contributors should rebuild and commit it when MCP source changes.

Run `npm test` and `npm run build` only when changing the optional Branch Canvas, Sites adapter, or remote HTTP MCP surfaces.

## Run a regression directly

```bash
node plugins/agenttape/scripts/agenttape.mjs test \
  tests/agenttape/fixture_permission_denied-timeout.tape
```

Passing assertions exit with code `0`; validation or assertion failures exit nonzero and omit captured comparison values.

## Optional development surfaces

The repository also contains a Branch Canvas prototype under `src/` and an experimental stateless HTTP MCP implementation under `remote/`. They exercise the same tape and replay core but are not required to install or use the Codex plugin and are not part of the open-source release gate.

## Security and privacy

Review every `.tape` before sharing it. The redaction marker proves that AgentTape's redactor ran; it cannot prove arbitrary free-form text contains no sensitive information. See [SECURITY.md](./SECURITY.md) and [docs/PRIVACY.md](./docs/PRIVACY.md).

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md), and [CHANGELOG.md](./CHANGELOG.md).

## License

MIT. See [LICENSE](./LICENSE).
