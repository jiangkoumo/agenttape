# Prototype Instructions

AgentTape is now a Codex plugin first. Phase 1 is a repository-local installable plugin that records supported Codex hook events, marks explicit tool failures, and emits a redacted version 1 `.tape` artifact. Keep the `.tape` format and recorder logic independent from the React prototype so later MCP and CI surfaces can reuse them.

The plugin lives under `plugins/agenttape/` and the repo marketplace entry lives at `.agents/plugins/marketplace.json`. Treat `hooks/hooks.json`, the bundled recorder scripts, and the capture skill as the Phase 1 product surface. Do not claim bit-exact or complete replay: Codex hosted tools are outside local hook coverage.

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

The selected AgentTape direction is option 2: a warm-white desktop causal branch canvas. Preserve the three-pane anatomy (run list, execution graph, evidence inspector), the original-failure versus successful-fork comparison, and the core path from failure injection to a saved `.tape` regression test.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## AgentTape and ToolFence dogfooding

Treat the repository containing `plugins/agenttape/` and `.agents/plugins/marketplace.json` as the formal AgentTape development target. Do not redirect plugin work to a UI-only prototype checkout.

AgentTape is the primary project. ToolFence is a companion dogfooding dependency and should change only in response to concrete friction observed during real AgentTape work. Route AgentTape MCP calls through the project-local `agenttape_fenced` ToolFence alias; AgentTape hooks may still record Codex built-in terminal, Git, and file tools, but ToolFence cannot mediate those built-ins.

The local policy allows `list_tapes`, `inspect_tape`, and `fork_run`, routes `save_regression` to approval, denies unreviewed tools by default, and keeps output redaction and privacy-conscious auditing enabled. Reviewers must choose `allow-once` for `save_regression`. After each real development task, compare ToolFence decisions/results with AgentTape events and review false decisions, approval noise, denied-call non-forwarding, redaction quality, process lifecycle friction, and any temptation to bypass ToolFence.

Only manually reviewed problems become committed regression coverage in either project. Keep `.agent-tape/runtime/`, `.agent-tape/tapes/`, `.toolfence/`, project-local MCP configuration, and unreviewed capture or regression artifacts uncommitted.

Use `docs/AGENTTAPE_TOOLFENCE_ALIGNMENT.md` for the mirrored cross-repository contract, then `docs/TOOLFENCE_DOGFOODING.md` for the AgentTape-side execution runbook. Distinguish a direct SDK/fixture smoke from a fresh Codex task using the project-scoped fenced alias, and never count a fixture-derived regression as real-round evidence.
