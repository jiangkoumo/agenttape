# Changelog

All notable AgentTape changes are documented here.

## 0.4.3 - 2026-08-30

- Preserve one coherent tape when `Stop` races a transcript-backed `PostToolUse`, while retaining privacy-safe synthetic terminal evidence when a real result never arrives.
- Keep `inspect_tape` and `fork_run` replay confidence consistent and conservatively low when tool results were not captured.
- Make saved regressions portable by retaining only safe assertions and event structure, removing embedded absolute paths and raw tool payloads, and rebuilding an accurate redaction manifest.
- Add the reviewed real AgentTape × ToolFence malformed-JSON regression and document the five-scenario joint-development contract.
- Enforce release tag, package, plugin, runtime, changelog, tracked regression, main ancestry, and rebuilt bundle consistency before GitHub publication.

## 0.4.2 - 2026-08-25

- Bundle the offline regression CLI and capture verifier so Git marketplace installs do not depend on the repository's `node_modules`.
- Point the capture skill and documentation at the self-contained installed CLI.
- Add a clean-install regression test that executes the bundled CLI outside the repository.

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
