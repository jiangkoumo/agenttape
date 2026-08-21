# AgentTape — Project Research and V1 Brief

Research date: 2026-08-21
Status: Product brief locked; Phase 1 plugin and Branch Canvas prototype are complete, with Phase 2 tracked in [PHASE_2_PLAN.md](./PHASE_2_PLAN.md).

## Executive read

AI-agent debugging is a real and growing developer pain: failures are non-deterministic, tool state is fragmented, and re-running a long trajectory is slow and expensive. The category is also becoming crowded quickly. Mature products such as Langfuse and Phoenix dominate observability and evaluation, while a new wave of small repositories—Culpa, agent-replay, Reprise, AgentReplay, Agent VCR, Kyoko, Rewind, and Evalcraft—already use language such as “time-travel debugging,” “deterministic replay,” “fork,” and “zero-cost replay.” Most of these newer repositories remain below 100 GitHub stars, suggesting that the concept alone is not a distribution advantage.

The strongest opening is therefore not “another agent trace viewer.” It is a deliberately narrow closed loop:

> Capture one real failure, find the first meaningful divergence, fork from that point, inject or edit one condition, and convert the verified fix into a portable CI regression case.

AgentTape should feel like a combination of browser DevTools, a flight recorder, and a failing test generator. Its public identity should emphasize the artifact it creates—a small, inspectable `.tape` evidence bundle—rather than a heavyweight platform.

## Product purpose

### One-line purpose

AgentTape turns failed AI-agent runs into reproducible, shareable regression tests.

### User promise

Record once. Reproduce without another model call. Change one condition. Prove the fix in CI.

### Target user

- Engineers building coding agents, MCP agents, and tool-using workflows.
- Maintainers receiving bug reports that cannot be reproduced locally.
- Teams that already have traces but cannot reliably replay or test a specific failure.

### Job to be done

When an agent fails after a long sequence of model and tool calls, help me identify the earliest consequential divergence, reproduce the same environment locally, test one counterfactual change, and prevent the failure from returning.

## Evidence and observations

### Observed evidence

1. Existing observability products already cover traces, metrics, datasets, prompt iteration, and evaluations. Competing head-on with their dashboards would be expensive and undifferentiated. [Langfuse](https://github.com/langfuse/langfuse) and [Phoenix](https://github.com/Arize-ai/phoenix) are the clearest incumbents.

2. Phoenix issues show that replaying a captured span can fail when the original tool protocol is incomplete; for example, a captured Anthropic `tool_use` without the associated `tool_result` cannot be replayed correctly. This supports treating tool state as a first-class replay dependency. [Phoenix issue #12975](https://github.com/Arize-ai/phoenix/issues/12975)

3. LangGraph users report long tool calls being silently re-executed from a checkpoint, creating duplicate work and cost. This is evidence that checkpoints alone do not guarantee safe replay semantics. [LangGraph issue #7417](https://github.com/langchain-ai/langgraph/issues/7417)

4. LangGraph users also report cancellation losing streamed state that has not yet been persisted. A trustworthy recorder must make incomplete and interrupted states explicit. [LangGraph issue #5672](https://github.com/langchain-ai/langgraph/issues/5672)

5. Coding-agent users value recovery from accidental changes. A highly interacted Codex request asks for `/undo` because untracked files can be modified or deleted. [Codex issue #9203](https://github.com/openai/codex/issues/9203)

6. Strands Evals has added deterministic failure injection for timeouts, network failures, execution errors, validation errors, truncated fields, removed fields, and corrupted values. A later request asks for runtime chaos injection, validating demand beyond offline evaluation. [Strands Evals](https://github.com/strands-agents/evals), [issue #300](https://github.com/strands-agents/evals/issues/300)

7. Community discussion repeatedly mentions missing agent state, silent tool failures, fragmented multi-agent traces, and hallucinated execution paths. This is anecdotal rather than representative, but it is consistent with the GitHub evidence. [LocalLLaMA discussion](https://www.reddit.com/r/LocalLLaMA/comments/1s7h7cj/i_analyzed_300_and_more_real_ai_agent_failures/)

8. Developers distinguish traces from evaluations: a trace is evidence, not a pass/fail verdict. Real failures need to become small evaluation cases with assertions at important decision points. [AI Agents debugging discussion](https://www.reddit.com/r/AI_Agents/comments/1v8wchg/debugging_agents/)

### Inference

- The category winner is more likely to own a portable failure artifact and workflow than another trace storage backend.
- The “first divergence” is a better primary object than a raw chronological event list.
- The shortest path to adoption is wrapping existing agent CLIs with no source-code instrumentation.
- The shortest path to GitHub sharing is a bug-report bundle that maintainers can open locally without credentials.

## Competitive landscape

Repository counts were checked on 2026-08-21 and will change.

| Project | Approx. stars | Main promise | Gap AgentTape can exploit |
| --- | ---: | --- | --- |
| [Langfuse](https://github.com/langfuse/langfuse) | 33.5k | Full LLM observability and evaluation platform | Broad platform; replay is not the primary artifact or workflow |
| [Phoenix](https://github.com/Arize-ai/phoenix) | 11.1k | AI observability and evaluation | Span replay is provider/tool-protocol sensitive |
| [Strands Evals](https://github.com/strands-agents/evals) | 180 | Agent evaluation and chaos testing | Framework-oriented, not a universal coding-agent recorder |
| [Kyoko](https://github.com/kayba-ai/Kyoko) | 95 | Local agent debugging and improvement suite | Broad surface and many adapters make the first-use story less singular |
| [Agent VCR](https://github.com/ixchio/agent-vcr) | 33 | Workspace rollback and ghost replay | Strong rollback angle; destructive Git semantics are risky as a default |
| [AgentClash](https://github.com/agentclash/agentclash) | 28 | Real-task agent evaluation and regression gates | Evaluation platform rather than a lightweight failure handoff artifact |
| [Culpa](https://github.com/AnshKanyadi/culpa) | 13 | Flight recorder and counterfactual replay | Similar concept; opportunity remains in UX, portability, and CI conversion |
| [agent-replay](https://github.com/clay-good/agent-replay) | 13 | Local trace replay, diff, guardrails | Similar breadth; product story is feature-heavy rather than one hero loop |
| [Rewind](https://github.com/agentoptics/rewind) | 11 | Time-travel debugger for agents | Very similar framing; currently low adoption and inactive since 2026-05 |
| [Evalcraft](https://github.com/beyhangl/evalcraft) | 4 | Generate deterministic pytest from one run | Excellent CI angle; less focused on interactive divergence diagnosis |
| [AgentReplay](https://github.com/gadda00/agentreplay) | 2 | Bit-exact replay and counterfactual debugging | Similar technical claim; opportunity in interoperability and usability |
| [Reprise](https://github.com/itsshreyasbhardwaj-design/reprise) | 1 | Local-first MCP-native replay | Similar artifact idea; no established community standard yet |

## Product wedge

### The object: `.tape`

A `.tape` is a content-addressed, redacted evidence bundle containing:

- Run metadata and source revision.
- Model request/response events required for replay.
- Tool calls, tool results, errors, and timing.
- Approval and rejection events.
- File patches and selected filesystem snapshots.
- Environment fingerprint: platform, relevant variables, time and random seeds where captured.
- Assertions describing what must or must not happen.
- Redaction manifest describing what was removed without storing the removed secret.

The open format should be documented independently from the implementation so other trace systems can export into it.

### The workflow

1. **Record** — wrap an existing command with one prefix.
2. **Detect** — highlight the first consequential divergence, not every noisy difference.
3. **Fork** — modify one model response, tool result, permission, or failure condition.
4. **Verify** — replay up to the fork with captured results, then run only the changed branch.
5. **Pin** — save assertions and export a local/CI regression test.
6. **Share** — send a redacted `.tape` with a bug report.

### Positioning

Avoid:

- “AI observability platform.”
- “All-in-one agent reliability suite.”
- “Another time-travel debugger.”

Prefer:

- “The failing test format for AI agents.”
- “Turn one bad run into a permanent regression test.”
- “A shareable bug report that can replay itself.”

## V1 scope

### Hero flow

The first release supports this demo:

```bash
agent-tape record -- codex exec "fix the failing tests"
agent-tape open last
agent-tape fork last --at tool:github.create_pr --inject permission-denied
agent-tape pin last --assert no-tool:github.create_pr --output tests/pr-permission.tape
agent-tape test tests/pr-permission.tape
```

### Included

- Codex `exec --json` capture adapter.
- Generic JSONL event ingestion.
- Local SQLite metadata plus content-addressed blobs.
- Read-only timeline and focused event inspector.
- First-divergence comparison between original and fork.
- Tool result substitution and four failure injections: timeout, permission denied, malformed JSON, truncated response.
- File diff inspection.
- Redacted `.tape` export/import.
- A deterministic structural assertion runner suitable for CI.
- A single demo fixture that works without API keys.

### Explicitly not in V1

- Hosted accounts, teams, billing, or collaboration.
- Prompt management, datasets, broad analytics, or production monitoring.
- LLM-as-a-judge scoring.
- Automatic destructive rollback.
- General-purpose multi-agent orchestration.
- Claims of bit-exact replay when uncaptured external state is involved.
- Claude Code, Cursor, OpenCode, and framework SDK integrations before the Codex path is excellent.

## Trust model

Replay must communicate its confidence honestly:

- **Hermetic** — all nondeterministic dependencies were captured and replayed.
- **Structural** — model/tool outputs are fixed, but some local code executes again.
- **Live fork** — execution after the fork can call real models or tools and may diverge.
- **Playback only** — the trace can be inspected but not executed.

Every result should show which mode was used. “Deterministic” should never be a blanket marketing claim.

## V1 information architecture

The primary desktop screen should show one failed run:

- Compact run identity and replay-confidence label.
- A horizontal or vertical causal trajectory.
- A visually dominant first-divergence marker.
- Original and forked state shown side by side only around the selected event.
- One primary action: create or run the regression case.
- Supporting actions: change injected condition, inspect raw event.

The screen should not lead with project dashboards, aggregate charts, or a feature-heavy sidebar.

## Technical direction

The implementation should remain intentionally small:

- Core and CLI: TypeScript on Node.js, matching Codex JSONL handling and enabling an easy npm install.
- Metadata: SQLite.
- Blob storage: content-addressed files under `.agent-tape/objects/`.
- Tape format: versioned JSON manifest plus compressed event/blob members.
- UI: local web app started by `agent-tape open`; no cloud dependency.
- Replay boundary: pure replay serves recorded model/tool results; live fork begins only after an explicit boundary.
- Assertions: deterministic structural checks in V1.

Architecture should separate the open tape schema from adapters and UI, but avoid a plugin framework until a second adapter proves the need.

## Open-source growth strategy

### Launch asset

A 20–30 second terminal-to-UI recording:

1. Agent fails after a tool permission error.
2. `agent-tape open last` jumps directly to the first divergence.
3. User changes one condition and presses “Verify branch.”
4. A green regression case is generated.
5. The same `.tape` runs in GitHub Actions with zero model calls.

### Repository qualities that matter more than feature count

- One-command demo with no API key.
- Animated hero showing the whole loop.
- Honest replay-mode labels and limitations.
- A short README before deep architecture docs.
- Stable `.tape` examples contributors can inspect.
- “Good first adapter” contribution path after V1.
- Security and redaction documentation from day one.

### First public milestones

- `v0.1`: Codex record → inspect → fork → pin → test.
- `v0.2`: Claude Code adapter and OpenTelemetry import.
- `v0.3`: MCP proxy adapter and community tape corpus.

## Success criteria

Product:

- A new user reaches the demo divergence screen in under two minutes.
- A provided failure fixture replays without network access or API keys.
- A user can change one tool result and compare the branch without re-running earlier model calls.
- A pinned tape exits non-zero when its structural assertions fail.
- Export removes configured secrets and reports what classes of data were redacted.

Open source:

- At least five independent contributors add fixtures or adapters within the first month.
- At least three external projects attach `.tape` files to issues or CI.
- README demo completion rate becomes the primary activation metric, not raw installs.

## Naming note

`AgentTape` is the provisional product name. As checked on 2026-08-21, `agent-tape` had no matching GitHub repository and the npm/PyPI package names appeared available. Availability is not a trademark clearance and must be checked again before publishing.
