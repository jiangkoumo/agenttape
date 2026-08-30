{
  "format": "agenttape.tape",
  "version": 1,
  "id": "tape_regression_85bc9b13cda8",
  "status": "captured",
  "capturedAt": "2026-08-29T14:17:36.859Z",
  "completedAt": "2026-08-29T16:42:06.252Z",
  "source": {
    "adapter": "agenttape-regression",
    "sessionId": "regression-source",
    "cwd": ".",
    "coverage": "supported-local-hooks"
  },
  "summary": {
    "eventCount": 4,
    "toolCallCount": 1,
    "failedToolCallCount": 0
  },
  "limitations": [],
  "events": [
    {
      "sequence": 1,
      "recordedAt": "2026-08-29T14:17:36.859Z",
      "type": "SessionStart"
    },
    {
      "sequence": 2,
      "recordedAt": "2026-08-29T14:17:36.935Z",
      "type": "UserPromptSubmit"
    },
    {
      "sequence": 3,
      "recordedAt": "2026-08-29T14:17:52.701Z",
      "type": "PreToolUse",
      "tool": {
        "name": "mcp__agenttape_fenced__list_tapes"
      }
    },
    {
      "sequence": 4,
      "recordedAt": "2026-08-29T14:17:52.765Z",
      "type": "PostToolUse",
      "tool": {
        "name": "mcp__agenttape_fenced__list_tapes"
      }
    }
  ],
  "redactions": {
    "applied": true,
    "count": 2,
    "strategy": "agenttape-v1",
    "paths": [
      "/source/cwd",
      "/source/sessionId"
    ]
  },
  "fork": {
    "sourceTapeId": "tape_regression_source",
    "boundarySequence": 3,
    "createdAt": "2026-08-29T16:42:06.252Z"
  },
  "injection": {
    "kind": "malformed_json",
    "targetSequence": 4,
    "mode": "recorded-result-substitution"
  },
  "assertions": [
    {
      "kind": "field_equals",
      "path": "/diff/after/error/code",
      "expected": "MALFORMED_JSON"
    },
    {
      "kind": "tool_present",
      "toolName": "mcp__agenttape_fenced__list_tapes"
    },
    {
      "kind": "max_retries",
      "maximum": 0
    },
    {
      "kind": "final_status",
      "expected": "failed"
    },
    {
      "kind": "min_replay_confidence",
      "minimum": 0.4
    }
  ],
  "replay": {
    "mode": "structural",
    "confidence": {
      "score": 0.4,
      "level": "low",
      "inputs": {
        "coverage": "supported-local-hooks",
        "capturedToolResults": false,
        "eventSequenceComplete": true,
        "externalStateCaptured": false,
        "redactionsPresent": true,
        "unknownToolCount": 0,
        "modelCallsBeforeFork": 0
      },
      "reasons": [
        "Coverage is supported-local-hooks.",
        "One or more tool results were not captured.",
        "External state was not captured.",
        "Redaction may hide replay-relevant values."
      ]
    }
  }
}
