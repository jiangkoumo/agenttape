# AgentTape plugin submission packet

This packet tracks the materials required by the official OpenAI plugin submission flow. It is not evidence that review or publication has occurred.

## Proposed listing

- Name: AgentTape
- Category: Productivity
- Short description: Turn redacted agent failures into portable evidence and offline structural regression tests.
- Long description: AgentTape records supported Codex hook events locally, marks explicit tool failures, exports versioned redacted `.tape` evidence, and provides deterministic structural inspection, branching, and assertion workflows without model or live-tool calls.
- License: MIT
- Website: the AgentTape Branch Canvas deployment
- Privacy: `/privacy` on the production remote MCP origin
- Terms: `/terms` on the production remote MCP origin
- Support: `/support` on the production remote MCP origin, to be replaced with a durable staffed channel before submission

## Positive review cases

1. **Validate a redacted capture**
   - Prompt: “Validate this AgentTape capture before I share it.”
   - Expected: `validate_tape`; returns valid v1 metadata, event count, redaction state, and confidence summary.
2. **Summarize a tool failure**
   - Prompt: “What failed in this tape and what evidence was captured?”
   - Expected: `inspect_tape`; returns the failed tool, failure kind/reason, run summary, event-type counts, and limitations without echoing every event value.
3. **Inject a timeout**
   - Prompt: “Fork after event 2 and substitute a five-second timeout at event 3.”
   - Expected: `fork_run`; returns a completed structural branch, timeout diff, and evidence showing zero model and live-tool calls.
4. **Inject a permission denial**
   - Prompt: “Show how the recorded tool result changes if permission is denied.”
   - Expected: `fork_run`; returns the recorded-result substitution and structural replay limitations.
5. **Run a saved regression**
   - Prompt: “Run the assertions embedded in this regression tape.”
   - Expected: `run_assertions`; returns pass/fail counts and per-assertion status without compared captured values.

## Negative review cases

1. **Unredacted tape**
   - Scenario: `redactions.applied` is false.
   - Expected: fail with `REMOTE_TAPE_NOT_REDACTED`; do not process or echo values.
2. **Request to rerun a live hosted tool**
   - Prompt: “Actually call the failed GitHub tool again and continue the agent.”
   - Expected: explain that AgentTape only performs recorded-result substitution; make no external call.
3. **Oversized or malformed input**
   - Scenario: request exceeds the limit or fails the v1 schema.
   - Expected: reject with a bounded size/schema error that reports no captured values.

## Release notes

Initial 0.3.0 release candidate: local Codex hooks and stdio MCP, tape v1 validation/redaction, four deterministic structural injections, offline assertions, Branch Canvas, owner-only hosted Demo, and a stateless Streamable HTTP MCP Worker for caller-supplied redacted tapes.

## External gates

- [ ] Authenticate a Cloudflare account and deploy the stable production `/mcp` endpoint.
- [ ] Verify every production tool call and public policy route.
- [ ] Choose a durable public support channel.
- [ ] Make the Branch Canvas public if desired and explicitly approved.
- [ ] Confirm OpenAI Platform Apps Management write access.
- [ ] Complete individual or business identity verification.
- [ ] Register the production MCP server in ChatGPT developer mode and add the resulting `.app.json` mapping.
- [ ] Complete the domain challenge at `/.well-known/openai-apps-challenge`.
- [ ] Enter publisher identity, country availability, policy attestations, and reviewer credentials if required.
- [ ] Submit for review; publication happens only after approval and an explicit publish action in the portal.
