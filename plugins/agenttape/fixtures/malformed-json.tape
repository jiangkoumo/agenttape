{
  "format": "agenttape.tape",
  "version": 1,
  "id": "tape_fixture_malformed_json",
  "status": "failed",
  "capturedAt": "2026-08-21T10:00:00.000Z",
  "completedAt": "2026-08-21T10:00:02.000Z",
  "source": {
    "adapter": "codex-hooks",
    "sessionId": "fixture-malformed-json",
    "turnId": "turn-1",
    "cwd": ".",
    "coverage": "supported-local-hooks"
  },
  "summary": {
    "eventCount": 3,
    "toolCallCount": 1,
    "failedToolCallCount": 1,
    "firstFailureSequence": 2
  },
  "limitations": ["The invalid tool payload is preserved as a redacted structural sample."],
  "events": [
    {
      "sequence": 1,
      "recordedAt": "2026-08-21T10:00:00.000Z",
      "type": "PreToolUse",
      "turnId": "turn-1",
      "tool": {
        "name": "json.parse",
        "useId": "tool-1",
        "input": { "payload": "[REDACTED]" }
      }
    },
    {
      "sequence": 2,
      "recordedAt": "2026-08-21T10:00:01.000Z",
      "type": "PostToolUse",
      "turnId": "turn-1",
      "tool": {
        "name": "json.parse",
        "useId": "tool-1",
        "output": { "status": "error", "errorCode": "MALFORMED_JSON", "message": "Unexpected token" },
        "failed": true,
        "failure": { "kind": "malformed_json", "reason": "The recorded tool result could not be decoded." }
      }
    },
    {
      "sequence": 3,
      "recordedAt": "2026-08-21T10:00:02.000Z",
      "type": "Stop",
      "turnId": "turn-1"
    }
  ],
  "artifacts": [
    {
      "id": "artifact-malformed-input",
      "kind": "tool_input",
      "mediaType": "application/json",
      "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "path": "artifacts/malformed-input.json",
      "redacted": true
    }
  ],
  "redactions": {
    "applied": true,
    "count": 1,
    "strategy": "agenttape-v1",
    "paths": ["/events/0/tool/input/payload"]
  },
  "fork": {
    "sourceTapeId": "tape_fixture_malformed_json_source",
    "boundarySequence": 1,
    "createdAt": "2026-08-21T10:05:00.000Z"
  },
  "injection": {
    "kind": "malformed_json",
    "targetSequence": 2,
    "mode": "recorded-result-substitution"
  },
  "assertions": [
    { "kind": "field_equals", "path": "/events/1/tool/output/errorCode", "expected": "MALFORMED_JSON" },
    { "kind": "final_status", "expected": "failed" }
  ],
  "replay": {
    "mode": "structural",
    "confidence": {
      "score": 0.65,
      "level": "medium",
      "inputs": {
        "coverage": "supported-local-hooks",
        "capturedToolResults": true,
        "eventSequenceComplete": true,
        "externalStateCaptured": false,
        "redactionsPresent": true,
        "unknownToolCount": 0,
        "modelCallsBeforeFork": 0
      },
      "reasons": [
        "Coverage is supported-local-hooks.",
        "External state was not captured.",
        "Redaction may hide replay-relevant values."
      ]
    }
  }
}
