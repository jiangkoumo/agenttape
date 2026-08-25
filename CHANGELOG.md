# Changelog

All notable AgentTape changes are documented here.

## 0.4.1 - 2026-08-25

- Cover all 11 current Codex hook events, including prompts, compaction, and subagent lifecycle events.
- Preserve event ordering when hook processes write concurrently.
- Recover real Bash exit status from the current Codex transcript when `PostToolUse` omits it.
- Redact prompt and lifecycle details, omit transcript paths, and shorten home-directory paths in portable tapes.
- Add a capture verifier and a directory-level regression command used by CI.
- Expand the capture skill into the complete inspect, fork, save, and offline-test workflow.

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
