# AgentTape privacy notes

AgentTape is local-first. The recorder stores supported hook events in the active project under `.agent-tape/`. The local MCP server and Branch Canvas read those workspace files directly; the core recorder, validator, replay engine, assertion runner, and local UI require no API key and make no network request.

Captured values pass through recursive redaction for known secret-bearing fields before a `.tape` is emitted. Redaction reduces exposure but is not a guarantee that arbitrary user content is non-sensitive. Users should inspect intentional exports before committing or sharing them.

The published Branch Canvas uses `public/demo/agenttape-demo.json`, generated from the repository's redacted permission-denied fixture. It does not upload, request, or receive a visitor's local `.agent-tape` files. Saving a regression is disabled in public Demo mode.

AgentTape does not provide cloud storage, accounts, analytics collection, telemetry, or team synchronization in the current release.
