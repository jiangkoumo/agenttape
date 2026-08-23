# AgentTape `.tape` version 1 contract

This document defines the stable AgentTape evidence contract shared by the recorder, MCP tools, structural replay, Branch Canvas, and CI runner. The normative machine-readable contract is [`plugins/agenttape/schemas/tape-v1.schema.json`](../plugins/agenttape/schemas/tape-v1.schema.json).

## Compatibility

- `format` must be `agenttape.tape` and `version` must be the integer `1`.
- Producers may add data only through fields already declared by the version 1 schema. Consumers reject unknown fields so contract changes stay explicit.
- A missing required field returns `TAPE_SCHEMA_INVALID`.
- An unknown major version returns `UNSUPPORTED_TAPE_VERSION`; version 1 consumers do not guess or silently migrate it.
- A future migration must read an older valid artifact, emit a new artifact without overwriting the source, and record the source version. No migration is implicit in the validator.
- Invalid JSON returns `MALFORMED_TAPE_JSON`. Validation errors contain paths and schema rules, never captured values.

## Run fields

The root object is the run. Its required evidence fields remain compatible with Phase 1:

| Field | Meaning |
| --- | --- |
| `id`, `status`, timestamps | Stable capture identity and lifecycle. |
| `source` | Adapter, session/turn identity, workspace and capture coverage. |
| `summary` | Event/tool/failure counts and optional first failure sequence. |
| `limitations` | Human-readable constraints; never interpret a tape as bit-exact replay. |
| `events` | Ordered lifecycle and tool evidence. Tool input/output may contain redaction markers. |
| `artifacts` | Optional content-addressed external evidence references. |
| `redactions` | Optional redaction manifest containing JSON Pointer paths, never secret values. |
| `fork` | Optional source tape and event boundary for a branch. |
| `injection` | Optional deterministic recorded-result substitution at one event. |
| `assertions` | Optional executable regression expectations. |
| `replay` | Optional structural replay mode and confidence evidence. |

Supported injections are `permission_denied`, `timeout`, `rate_limited`, `malformed_json`, and `truncated_response`. Supported assertions are `field_equals`, `tool_present`, `tool_absent`, `tool_order`, `max_retries`, `final_status`, and `min_replay_confidence`. Version 1 permits only `recorded-result-substitution`; live tool or model execution is outside this contract.

## Replay confidence

Confidence is deterministic and is recalculated by the validator from the stored inputs. Begin at `1.00`, apply every relevant downgrade, clamp at zero, and round to two decimals.

| Input | Downgrade |
| --- | ---: |
| Coverage `supported-local-hooks` / `partial` / `unknown` | `0.15` / `0.35` / `0.55` |
| Missing captured tool result | `0.25` |
| Incomplete event sequence | `0.20` |
| External state not captured | `0.15` |
| Redaction present | `0.05` |
| Unknown tool type | `0.10` each, capped at `0.30` |
| Model call before fork boundary | `0.35` |

Levels are `high` at `0.85+`, `medium` at `0.65+`, `low` at `0.40+`, and `playback_only` below `0.40`. Confidence communicates evidence quality; it does not claim complete or bit-exact replay.

## Validation

Validate an artifact without network or API credentials:

```bash
node plugins/agenttape/scripts/agenttape.mjs validate \
  plugins/agenttape/fixtures/permission-denied.tape
```

The fixed fixtures cover permission denial, timeout, and malformed tool JSON. The malformed-JSON fixture is itself valid `.tape` JSON; it records a malformed tool result as evidence.
