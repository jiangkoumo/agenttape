import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  SUPPORTED_INJECTIONS,
  structuralReplay,
} from "../plugins/agenttape/replay/structural-replay.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = JSON.parse(await readFile(
  path.join(projectRoot, "plugins", "agenttape", "fixtures", "permission-denied.tape"),
  "utf8",
));

const expectedCodes = {
  permission_denied: "PERMISSION_DENIED",
  timeout: "TIMEOUT",
  rate_limited: "RATE_LIMITED",
  malformed_json: "MALFORMED_JSON",
  truncated_response: "TRUNCATED_RESPONSE",
};

test("replays all supported injections deterministically without model or live tool calls", () => {
  for (const kind of SUPPORTED_INJECTIONS) {
    const options = {
      boundarySequence: 2,
      targetSequence: 3,
      injection: { kind, parameters: { timeoutMs: 1234, maxBytes: 512, retryAfterSeconds: 120 } },
    };
    const first = structuralReplay(fixture, options);
    const second = structuralReplay(fixture, options);

    assert.deepEqual(second, first);
    assert.equal(first.status, "completed");
    assert.equal(first.mode, "structural");
    assert.equal(first.events.length, 3);
    assert.equal(first.events[2].tool.output.error.code, expectedCodes[kind]);
    if (kind === "rate_limited") {
      assert.equal(first.events[2].tool.output.statusCode, 429);
      assert.equal(first.events[2].tool.output.retryAfterSeconds, 120);
    }
    assert.equal(first.evidence.modelCallsBeforeFork, 0);
    assert.equal(first.evidence.liveToolCalls, 0);
    assert.equal(first.diff.targetSequence, 3);
    assert.equal(first.branch.mode, "recorded-result-substitution");
  }
});

test("preserves every recorded event through the fork boundary", () => {
  const result = structuralReplay(fixture, {
    boundarySequence: 2,
    injection: { kind: "timeout" },
  });
  assert.deepEqual(result.events.slice(0, 2), fixture.events.slice(0, 2));
  assert.equal(result.evidence.replayedEventCount, 2);
  assert.equal(result.confidence.level, "medium");
});

test("returns playback_only for unsafe or unsupported replay requests", () => {
  const unsupported = structuralReplay(fixture, {
    boundarySequence: 2,
    injection: { kind: "live_tool_call" },
  });
  assert.equal(unsupported.status, "playback_only");
  assert.match(unsupported.reason, /not supported/);

  const missingTarget = structuralReplay(fixture, {
    boundarySequence: 3,
    injection: { kind: "timeout" },
  });
  assert.equal(missingTarget.status, "playback_only");
  assert.match(missingTarget.reason, /No replayable/);
});
