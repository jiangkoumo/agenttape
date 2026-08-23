import { structuralReplay } from "./structural-replay.mjs";
import { validateTape } from "../scripts/tape-schema.mjs";

function pointerValue(value, pointer) {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) return undefined;
  return pointer.slice(1).split("/").reduce((current, segment) => {
    if (current == null) return undefined;
    const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
    return current[key];
  }, value);
}

function completedToolCalls(result) {
  return result.events?.filter((event) => event.type === "PostToolUse" && event.tool) || [];
}

function retryCount(result) {
  const counts = new Map();
  for (const event of completedToolCalls(result)) {
    counts.set(event.tool.name, (counts.get(event.tool.name) || 0) + 1);
  }
  return Math.max(0, ...[...counts.values()].map((count) => count - 1));
}

function evaluate(assertion, result) {
  if (assertion.kind === "field_equals") {
    const actual = pointerValue(result, assertion.path);
    return {
      passed: JSON.stringify(actual) === JSON.stringify(assertion.expected),
      expected: assertion.expected,
      actual,
      message: `Expected ${assertion.path} to equal the recorded value.`,
    };
  }
  if (assertion.kind === "tool_present" || assertion.kind === "tool_absent") {
    const present = completedToolCalls(result).some((event) => event.tool.name === assertion.toolName);
    const expected = assertion.kind === "tool_present";
    return {
      passed: present === expected,
      expected,
      actual: present,
      message: `Expected tool ${assertion.toolName} to be ${expected ? "present" : "absent"}.`,
    };
  }
  if (assertion.kind === "tool_order") {
    const tools = completedToolCalls(result).map((event) => event.tool.name);
    const firstIndex = tools.indexOf(assertion.firstTool);
    const secondIndex = tools.indexOf(assertion.secondTool);
    const passed = firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
    return {
      passed,
      expected: `${assertion.firstTool} before ${assertion.secondTool}`,
      actual: firstIndex === -1
        ? `missing ${assertion.firstTool}`
        : secondIndex === -1
          ? `missing ${assertion.secondTool}`
          : `${assertion.firstTool} at index ${firstIndex}, ${assertion.secondTool} at index ${secondIndex}`,
      message: `Expected tool ${assertion.firstTool} to be executed before ${assertion.secondTool}.`,
    };
  }
  if (assertion.kind === "max_retries") {
    const actual = retryCount(result);
    return {
      passed: actual <= assertion.maximum,
      expected: assertion.maximum,
      actual,
      message: "Expected retry count not to exceed the configured maximum.",
    };
  }
  if (assertion.kind === "final_status") {
    return {
      passed: result.finalStatus === assertion.expected,
      expected: assertion.expected,
      actual: result.finalStatus,
      message: "Expected the structural replay to end with the configured status.",
    };
  }
  const actual = result.confidence?.score;
  return {
    passed: typeof actual === "number" && actual >= assertion.minimum,
    expected: assertion.minimum,
    actual,
    message: "Expected replay confidence to meet the configured minimum.",
  };
}

export function runRegressionTape(tape) {
  validateTape(tape);
  if (!tape.fork || !tape.injection || !tape.assertions?.length) {
    return {
      tapeId: tape.id,
      passed: false,
      replay: null,
      assertions: [],
      error: { code: "NOT_A_REGRESSION_TAPE", message: "Tape requires fork, injection, and assertions fields." },
    };
  }

  const replay = structuralReplay(tape, {
    boundarySequence: tape.fork.boundarySequence,
    targetSequence: tape.injection.targetSequence,
    injection: tape.injection,
  });
  if (replay.status !== "completed") {
    return {
      tapeId: tape.id,
      passed: false,
      replay,
      assertions: [],
      error: { code: "REPLAY_NOT_EXECUTABLE", message: replay.reason },
    };
  }

  const assertions = tape.assertions.map((assertion, index) => ({
    index,
    kind: assertion.kind,
    ...evaluate(assertion, replay),
  }));
  return {
    tapeId: tape.id,
    passed: assertions.every((assertion) => assertion.passed),
    replay,
    assertions,
    summary: {
      total: assertions.length,
      passed: assertions.filter((assertion) => assertion.passed).length,
      failed: assertions.filter((assertion) => !assertion.passed).length,
    },
  };
}
