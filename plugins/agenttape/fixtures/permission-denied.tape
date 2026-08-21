{
  "format": "agenttape.tape",
  "version": 1,
  "id": "tape_fixture_permission_denied",
  "status": "failed",
  "capturedAt": "2026-08-21T08:00:00.000Z",
  "completedAt": "2026-08-21T08:00:03.000Z",
  "source": {
    "adapter": "codex-hooks",
    "sessionId": "fixture-permission-denied",
    "turnId": "turn-1",
    "cwd": ".",
    "model": "fixture-model",
    "coverage": "supported-local-hooks"
  },
  "summary": {
    "eventCount": 4,
    "toolCallCount": 1,
    "failedToolCallCount": 1,
    "firstFailureSequence": 3
  },
  "limitations": [
    "Hosted tools outside the Codex local hook path are not captured.",
    "This fixture supports structural replay, not bit-exact replay."
  ],
  "events": [
    {
      "sequence": 1,
      "recordedAt": "2026-08-21T08:00:00.000Z",
      "type": "SessionStart",
      "turnId": "turn-1"
    },
    {
      "sequence": 2,
      "recordedAt": "2026-08-21T08:00:01.000Z",
      "type": "PreToolUse",
      "turnId": "turn-1",
      "tool": {
        "name": "github.create_issue",
        "useId": "tool-1",
        "input": {
          "repository": "example/project",
          "authorization": "[REDACTED]"
        }
      }
    },
    {
      "sequence": 3,
      "recordedAt": "2026-08-21T08:00:02.000Z",
      "type": "PostToolUse",
      "turnId": "turn-1",
      "tool": {
        "name": "github.create_issue",
        "useId": "tool-1",
        "output": {
          "status": "denied",
          "message": "Permission denied"
        },
        "failed": true,
        "failure": {
          "kind": "permission_denied",
          "reason": "The recorded tool result denied the operation."
        }
      }
    },
    {
      "sequence": 4,
      "recordedAt": "2026-08-21T08:00:03.000Z",
      "type": "Stop",
      "turnId": "turn-1"
    }
  ],
  "redactions": {
    "applied": true,
    "count": 1,
    "strategy": "agenttape-v1",
    "paths": ["/events/1/tool/input/authorization"]
  },
  "fork": {
    "sourceTapeId": "tape_fixture_permission_denied_source",
    "boundarySequence": 2,
    "createdAt": "2026-08-21T08:05:00.000Z"
  },
  "injection": {
    "kind": "permission_denied",
    "targetSequence": 3,
    "mode": "recorded-result-substitution"
  },
  "assertions": [
    { "kind": "final_status", "expected": "failed" },
    { "kind": "tool_present", "toolName": "github.create_issue" },
    { "kind": "max_retries", "maximum": 0 },
    { "kind": "min_replay_confidence", "minimum": 0.65 }
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
