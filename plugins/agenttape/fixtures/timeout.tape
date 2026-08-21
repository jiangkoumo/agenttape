{
  "format": "agenttape.tape",
  "version": 1,
  "id": "tape_fixture_timeout",
  "status": "failed",
  "capturedAt": "2026-08-21T09:00:00.000Z",
  "completedAt": "2026-08-21T09:00:02.000Z",
  "source": {
    "adapter": "codex-hooks",
    "sessionId": "fixture-timeout",
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
  "limitations": ["Network state is represented only by the recorded result."],
  "events": [
    {
      "sequence": 1,
      "recordedAt": "2026-08-21T09:00:00.000Z",
      "type": "PreToolUse",
      "turnId": "turn-1",
      "tool": {
        "name": "http.fetch",
        "useId": "tool-1",
        "input": { "url": "https://example.invalid/data" }
      }
    },
    {
      "sequence": 2,
      "recordedAt": "2026-08-21T09:00:01.000Z",
      "type": "PostToolUse",
      "turnId": "turn-1",
      "tool": {
        "name": "http.fetch",
        "useId": "tool-1",
        "output": { "status": "failed", "errorCode": "TIMEOUT", "elapsedMs": 30000 },
        "failed": true,
        "failure": { "kind": "timeout", "reason": "The recorded request exceeded its deadline." }
      }
    },
    {
      "sequence": 3,
      "recordedAt": "2026-08-21T09:00:02.000Z",
      "type": "Stop",
      "turnId": "turn-1"
    }
  ],
  "fork": {
    "sourceTapeId": "tape_fixture_timeout_source",
    "boundarySequence": 1,
    "createdAt": "2026-08-21T09:05:00.000Z"
  },
  "injection": {
    "kind": "timeout",
    "targetSequence": 2,
    "mode": "recorded-result-substitution",
    "parameters": { "elapsedMs": 30000 }
  },
  "assertions": [
    { "kind": "field_equals", "path": "/events/1/tool/output/errorCode", "expected": "TIMEOUT" },
    { "kind": "final_status", "expected": "failed" }
  ],
  "replay": {
    "mode": "structural",
    "confidence": {
      "score": 0.7,
      "level": "medium",
      "inputs": {
        "coverage": "supported-local-hooks",
        "capturedToolResults": true,
        "eventSequenceComplete": true,
        "externalStateCaptured": false,
        "redactionsPresent": false,
        "unknownToolCount": 0,
        "modelCallsBeforeFork": 0
      },
      "reasons": [
        "Coverage is supported-local-hooks.",
        "External state was not captured."
      ]
    }
  }
}
