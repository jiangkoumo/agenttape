# AgentTape design and release QA

- Source direction: `docs/reference-option-2.png`
- Product state: warm-white desktop causal branch canvas
- Public build mode: deterministic, redacted, read-only Demo
- Local build mode: workspace-backed tape list, inspection, structural fork, and regression save
- Browser viewports verified: 1440 × 1024 and 1024 × 768

## Findings

No actionable P0, P1, or P2 visual differences remain.

- The three-pane anatomy is preserved: run context, execution graph, and evidence inspector.
- The canvas distinguishes the captured past, fork boundary, original trajectory, and injected structural branch.
- The inspector presents the unchanged tool input, result diff, and regression target without implying a live model or hosted-tool replay.
- Warm-white surfaces, neutral borders, red recorded failure state, and blue injected branch retain the selected visual direction.
- Persistent controls remain available at both verified desktop widths.

## Public Demo checks

- A static build with no local API falls back to `public/demo/agenttape-demo.json`.
- The Demo badge is visible and the bundled tape is selected.
- The header reports `0 model calls` and `0 live tools`.
- `Change condition` opens all four supported injections.
- Selecting `Tool timeout` updates the structural branch.
- The save action is disabled and labelled `Install locally to save`.

## Local workflow checks

- The production preview loads a real workspace tape through the local API.
- Inspecting the captured `github.create_issue` failure populates the graph and inspector.
- Changing the condition to timeout updates the branch without a model or live tool call.
- Saving creates `tests/agenttape/fixture_permission_denied-timeout.tape` without overwriting an existing file.
- The saved regression passes all four offline assertions.

## Remaining polish

- P3: use an approved monochrome AgentTape mark if a final brand asset is supplied.
- P3: tune small-text font rasterization if exact source typography becomes available.

final result: passed
