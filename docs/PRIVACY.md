# AgentTape privacy notes

AgentTape is local-first. The recorder stores supported hook events in the active project under `.agent-tape/`. The local MCP server and Branch Canvas read those workspace files directly; the core recorder, validator, replay engine, assertion runner, and local UI require no API key and make no network request.

Captured values pass through recursive redaction for known secret-bearing fields before a `.tape` is emitted. Redaction reduces exposure but is not a guarantee that arbitrary user content is non-sensitive. Users should inspect intentional exports before committing or sharing them.

The published Branch Canvas uses `public/demo/agenttape-demo.json`, generated from the repository's redacted permission-denied fixture. It does not upload, request, or receive a visitor's local `.agent-tape` files. Saving a regression is disabled in public Demo mode.

The optional remote MCP processes a caller-supplied tape transiently in memory. It refuses tapes that are not explicitly marked as redacted, does not persist tape contents, does not read local files, and does not call a model or live tool. Its Cloudflare infrastructure may retain ordinary request metadata for security, abuse prevention, and reliability; application code does not log request bodies or tool results.

AgentTape does not provide cloud tape storage, accounts, behavioral analytics, or team synchronization in the current release.
