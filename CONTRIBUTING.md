# Contributing to AgentTape

Thanks for helping improve AgentTape. Bug reports, focused feature proposals, documentation fixes, fixtures, and pull requests are welcome.

## Development setup

AgentTape requires Node.js 20 or newer.

```bash
git clone https://github.com/jiangkoumo/agenttape.git
cd agenttape
npm ci
npm run test:plugin-release
npm run build:plugin
```

Run `npm run build:mcp` after changing files under `plugins/agenttape/mcp/`, `plugins/agenttape/replay/`, or the tape schema, and include the updated bundled `plugins/agenttape/dist/mcp-server.mjs`.

## Pull requests

- Keep changes focused and explain the user-visible behavior.
- Add or update tests for behavior changes.
- Keep fixtures synthetic and redacted.
- Do not commit `.agent-tape/` runtime data or live credentials.
- Preserve the documented replay boundary: AgentTape does not regenerate downstream model reasoning or claim complete replay.
- Ensure `npm run test:plugin-release`, `npm run build:plugin`, and `git diff --check` pass.
- If the change touches `src/`, `worker/`, `remote/`, or Sites integration, also run `npm test` and `npm run build`.

## Security reports

Do not open public issues containing credentials or private captures. Follow [SECURITY.md](./SECURITY.md) for vulnerability reporting.
