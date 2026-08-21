# AgentTape Codex Plugin — Phase 1

Status: completed on 2026-08-21. The next milestone is documented in [PHASE_2_PLAN.md](./PHASE_2_PLAN.md).

## Goal

Ship a repository-local Codex plugin that converts supported Codex tool activity into redacted, versioned `.tape` evidence without depending on the React prototype.

## Acceptance criteria

- [x] Codex plugin manifest validates.
- [x] Repository marketplace exposes `agenttape` as an installable plugin.
- [x] Trusted hooks record session, permission, and supported local tool events.
- [x] A completed turn emits one version 1 `.tape` file.
- [x] Explicit non-zero exits, denied results, and structured tool errors mark the tape as failed.
- [x] Common secret keys are redacted before data reaches disk.
- [x] The bundled CLI lists, reads, and exports the latest capture.
- [x] An integration test simulates a failing Codex turn and verifies the exported artifact.

## Verification baseline

- `npm run test:plugin`: 2/2 passing.
- Plugin and Skill validation: passing.
- Repository marketplace: isolated installation smoke test passing.
- Current system Codex CLI: 0.149.0; existing global `agents` configuration parses successfully.

The repository bundle is ready for Phase 2 development, but it has not been installed into the current user's global plugin list.

## Deferred to Phase 2

- MCP tools and custom evidence UI.
- Branching from an event boundary.
- Failure injection.
- Structural replay and assertions runner.
- CI execution of saved `.tape` regressions.

The earlier Branch Canvas remains a visual design asset, but it is no longer the Phase 1 runtime.
