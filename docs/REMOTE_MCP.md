# AgentTape remote MCP

## Purpose

The remote surface makes the portable part of AgentTape usable from clients that can reach a Streamable HTTP MCP server. It does not pretend to read a user's local workspace. The caller must explicitly supply a redacted AgentTape v1 document.

## Endpoint contract

The Worker in `remote/worker.mjs` serves:

- `POST /mcp`: stateless Streamable HTTP MCP, with legacy stateless compatibility.
- `GET /health`: version and storage posture.
- `GET /privacy`, `/terms`, `/support`: public review material.
- `GET /.well-known/openai-apps-challenge`: returns a deployment-provided verification token only when configured.

The MCP exposes four read-only, closed-world tools:

| Tool | Purpose |
| --- | --- |
| `validate_tape` | Validate schema, confidence, size, and explicit redaction state. |
| `inspect_tape` | Return run/failure summaries without echoing every event value. |
| `fork_run` | Perform one deterministic recorded-result substitution. |
| `run_assertions` | Execute embedded regression assertions without returning compared values. |

## Data and safety boundaries

- Maximum encoded tape size: 1 MiB.
- Maximum HTTP request body: 1,100,000 bytes.
- `redactions.applied` must be `true`.
- No tape storage, accounts, model calls, or live-tool calls.
- Unexpected browser origins are rejected; server-to-server requests without an `Origin` header are accepted.
- Responses use no-store, no-referrer, frame-deny, and MIME-sniffing protections.
- Structural replay stops at the injected tool result.

## Build and test

```bash
npm run test:http-mcp
npm run build:http-mcp
```

The test suite connects with the official MCP v2 client over a custom fetch transport, lists all tools, invokes every tool, and covers unredacted, oversized, cross-origin, policy, and challenge cases. The Wrangler dry-run bundles the Worker for the Cloudflare runtime.

## Deployment

Authenticate first with `npx wrangler whoami`; if needed, complete `npx wrangler login`. Then deploy with `npm run deploy:http-mcp`. After deployment, rerun the same tool calls against the production `/mcp` URL and verify the health and policy routes.

Public plugin submission additionally requires domain verification, a registered MCP connection, verified publisher identity, Apps Management write access, public listing/support URLs, and portal review.
