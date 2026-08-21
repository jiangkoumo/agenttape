# Security policy

AgentTape processes local tool traces that may contain sensitive inputs or outputs. Do not attach live credentials, private production captures, or unredacted `.agent-tape/runtime/` files to public issues.

## Reporting a vulnerability

Use the repository host's private security-advisory channel when available. Include the affected AgentTape version, a minimal redacted reproduction, and the expected security boundary. If no private channel is available, open a public issue containing only non-sensitive reproduction steps and request a private follow-up channel.

## Security boundaries

- Runtime captures remain under the active workspace's `.agent-tape/` directory.
- MCP reads are limited to `.agent-tape/tapes/` under the resolved workspace root.
- Regression writes are limited to `tests/agenttape/` and do not overwrite by default.
- Tape reads reject directory escapes, symbolic links, oversized files, invalid schemas, and duplicate tape IDs.
- Structural replay never calls a model or live tool.
- The public demo contains only a generated, redacted fixture and cannot access local captures.

AgentTape cannot redact secrets that never reach supported hooks, and it cannot observe hosted tools outside local hook coverage. Review exported `.tape` files before sharing them.
