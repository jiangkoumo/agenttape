# Changelog

All notable AgentTape changes are documented here.

## 0.4.0 - 2026-08-23

- Add `rate_limited` (HTTP 429) structural failure injection with configurable `retryAfterSeconds`.
- Add `tool_order` assertion to verify tool execution sequence in offline regression tests.
- Fix `exit_code: undefined` false-positive detection in failure signal detector.
- Add error handling in `listTapes` to gracefully skip corrupted tape files.
- Add optional chaining and fallback for `tool.failure` in CLI summarize.
- Align version consistency across remote Worker and test suite.

- Include the prebuilt MCP server in Git marketplace installs so AgentTape runs without repository dependencies or a local build.

## 0.3.0 - 2026-08-21

- Publish AgentTape as an installable repository marketplace for Codex.
- Record supported Codex hook events as redacted version 1 `.tape` files.
- Bundle local MCP tools for listing, inspecting, structurally forking, and saving regressions.
- Add four structural failure injections and six offline assertion types.
- Add a local Branch Canvas and synthetic read-only demo fixtures.
- Add schema, path-boundary, redaction, MCP, replay, API, build, and release tests.
