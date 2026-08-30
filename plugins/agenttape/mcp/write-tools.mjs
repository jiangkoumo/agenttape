import { constants } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { AgentTapeAccessError, loadWorkspaceTape } from "./tape-access.mjs";
import { structuralReplay } from "../replay/structural-replay.mjs";
import { validateTape } from "../scripts/tape-schema.mjs";

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function defaultAssertions(tape, result) {
  const target = result.events.at(-1);
  return [
    { kind: "final_status", expected: result.finalStatus },
    { kind: "tool_present", toolName: target.tool.name },
    { kind: "max_retries", maximum: 0 },
    { kind: "min_replay_confidence", minimum: Math.min(result.confidence.score, 0.65) },
  ];
}

function replayInjection(options) {
  const parameters = {
    ...(Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? { timeoutMs: options.timeoutMs } : {}),
    ...(Number.isInteger(options.maxBytes) && options.maxBytes > 0 ? { maxBytes: options.maxBytes } : {}),
    ...(Number.isInteger(options.retryAfterSeconds) && options.retryAfterSeconds > 0
      ? { retryAfterSeconds: options.retryAfterSeconds }
      : {}),
  };
  return {
    kind: options.injection,
    ...(Object.keys(parameters).length ? { parameters } : {}),
  };
}

function pointerSegment(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function replaceLocalPath(value, replacements) {
  let sanitized = value;
  for (const [localPath, replacement] of replacements) {
    if (localPath && sanitized.includes(localPath)) sanitized = sanitized.replaceAll(localPath, replacement);
  }
  if (path.posix.isAbsolute(sanitized) || path.win32.isAbsolute(sanitized)) return "[ABSOLUTE_PATH]";
  return sanitized.replace(
    /(^|[^A-Za-z0-9./\\])((?:\/(?!\/)|[A-Za-z]:[\\/]|\\\\[^\\/\s"'`),;]+[\\/])[^\s"'`),;]*)/g,
    "$1[ABSOLUTE_PATH]",
  );
}

function minimizeCapturedValue(value, replacements, pointer, redactionPaths) {
  if (typeof value === "string") {
    const sanitized = replaceLocalPath(value, replacements);
    if (sanitized !== value) redactionPaths.add(pointer || "/");
    return sanitized;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => minimizeCapturedValue(item, replacements, `${pointer}/${index}`, redactionPaths));
  }
  if (value === null || typeof value !== "object") return value;

  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    const itemPointer = `${pointer}/${pointerSegment(key)}`;
    if (["artifacts", "artifact", "content", "details", "input", "output"].includes(key)) {
      redactionPaths.add(itemPointer);
      continue;
    }
    if (key === "prompt") {
      sanitized[key] = "[OMITTED_FROM_REGRESSION]";
      redactionPaths.add(itemPointer);
      continue;
    }
    if (key === "sessionId") {
      sanitized[key] = "regression-source";
      redactionPaths.add(itemPointer);
      continue;
    }
    if (["turnId", "useId", "expected"].includes(key)) {
      redactionPaths.add(itemPointer);
      continue;
    }
    sanitized[key] = minimizeCapturedValue(item, replacements, itemPointer, redactionPaths);
  }
  return sanitized;
}

function updateRedactions(regression, redactionPaths) {
  const paths = [...redactionPaths]
    .filter((pointer) => pointerValue(regression, pointer) !== undefined)
    .sort();
  regression.redactions = {
    applied: paths.length > 0,
    count: paths.length,
    strategy: "agenttape-v1",
    paths,
  };
}

function pointerValue(value, pointer) {
  if (!pointer.startsWith("/")) return undefined;
  return pointer.slice(1).split("/").reduce((current, segment) => {
    if (current == null) return undefined;
    return current[segment.replace(/~1/g, "/").replace(/~0/g, "~")];
  }, value);
}

function clearRedactionPaths(redactionPaths, prefix) {
  for (const pointer of redactionPaths) {
    if (pointer === prefix || pointer.startsWith(prefix + "/")) redactionPaths.delete(pointer);
  }
}

function portableAssertions(assertions, result, redactionPaths, replacements) {
  const completed = result.events.filter((event) => event.type === "PostToolUse" && event.tool);
  const retryCount = Math.max(0, ...[...completed.reduce((counts, event) => {
    counts.set(event.tool.name, (counts.get(event.tool.name) || 0) + 1);
    return counts;
  }, new Map()).values()].map((count) => count - 1));

  return assertions.flatMap((assertion, index) => {
    const assertionPointer = `/assertions/${index}`;
    if (assertion.kind === "field_equals") {
      const expected = pointerValue(result, assertion.path);
      if (expected === undefined) return [];
      return [{ kind: "field_equals", path: assertion.path, expected: structuredClone(expected) }];
    }
    if (assertion.kind === "tool_present") {
      const tool = completed.find((event) => event.tool.name === assertion.toolName);
      if (!tool) return [];
      return [{ kind: "tool_present", toolName: tool.tool.name }];
    }
    if (assertion.kind === "tool_absent") {
      const toolName = replaceLocalPath(assertion.toolName, replacements);
      if (toolName !== assertion.toolName) redactionPaths.add(assertionPointer + "/toolName");
      return [{ kind: "tool_absent", toolName }];
    }
    if (assertion.kind === "tool_order") {
      const first = completed.findIndex((event) => event.tool.name === assertion.firstTool);
      const second = completed.findIndex((event) => event.tool.name === assertion.secondTool);
      if (first === -1 || second === -1 || first >= second) return [];
      return [{
        kind: "tool_order",
        firstTool: completed[first].tool.name,
        secondTool: completed[second].tool.name,
      }];
    }
    if (assertion.kind === "max_retries") {
      return [{ kind: "max_retries", maximum: retryCount }];
    }
    if (assertion.kind === "final_status") {
      return [{ kind: "final_status", expected: result.finalStatus }];
    }
    if (assertion.kind === "min_replay_confidence") {
      return [{ kind: "min_replay_confidence", minimum: Math.min(result.confidence.score, 0.65) }];
    }
    return [];
  });
}

function portableRegressionTape(tape, workspace, requestedWorkspace, targetSequence) {
  const redactionPaths = new Set();
  const replacements = [
    [workspace, "[WORKSPACE]"],
    [requestedWorkspace, "[WORKSPACE]"],
    [os.homedir(), "~"],
  ].filter(([localPath], index, entries) => entries.findIndex(([candidate]) => candidate === localPath) === index)
    .sort(([left], [right]) => right.length - left.length);
  const captured = minimizeCapturedValue(structuredClone(tape), replacements, "", redactionPaths);
  const regression = structuredClone(captured);
  const mark = (pointer) => redactionPaths.add(pointer);

  clearRedactionPaths(redactionPaths, "/source");
  regression.source = {
    adapter: "agenttape-regression",
    sessionId: "regression-source",
    cwd: ".",
    coverage: regression.source.coverage,
  };
  mark("/source/sessionId");
  mark("/source/cwd");
  regression.events = regression.events
    .filter((event) => event.sequence <= targetSequence)
    .map((event) => {
      const portable = {
        sequence: event.sequence,
        recordedAt: event.recordedAt,
        type: event.type,
      };
      if (event.tool) portable.tool = { name: event.tool.name };
      return portable;
    });
  regression.limitations = [];
  for (const field of ["artifacts", "assertions", "fork", "injection", "replay", "redactions"]) {
    if (field in regression) delete regression[field];
    clearRedactionPaths(redactionPaths, "/" + field);
  }

  const completed = regression.events.filter((event) => event.type === "PostToolUse" && event.tool);
  regression.summary = {
    eventCount: regression.events.length,
    toolCallCount: completed.length,
    failedToolCallCount: 0,
  };
  updateRedactions(regression, redactionPaths);
  return { regression, redactionPaths, replacements };
}

export async function forkWorkspaceRun(workspaceRoot, options) {
  const tape = await loadWorkspaceTape(workspaceRoot, options.id);
  return structuralReplay(tape, {
    boundarySequence: options.boundarySequence,
    targetSequence: options.targetSequence,
    injection: replayInjection(options),
  });
}

export async function saveWorkspaceRegression(workspaceRoot, options) {
  const tape = await loadWorkspaceTape(workspaceRoot, options.id);
  const result = await forkWorkspaceRun(workspaceRoot, options);
  if (result.status !== "completed") {
    throw new AgentTapeAccessError("REPLAY_NOT_EXECUTABLE", result.reason);
  }

  const requestedWorkspace = path.resolve(workspaceRoot);
  const workspace = await realpath(requestedWorkspace);
  const { regression, redactionPaths, replacements } = portableRegressionTape(
    tape,
    workspace,
    requestedWorkspace,
    result.branch.targetSequence,
  );
  regression.id = `tape_regression_${result.branch.id.slice("branch_".length)}`;
  regression.fork = {
    sourceTapeId: "tape_regression_source",
    boundarySequence: options.boundarySequence,
    createdAt: regression.completedAt,
  };
  const sanitizedReplay = structuralReplay(regression, {
    boundarySequence: options.boundarySequence,
    targetSequence: options.targetSequence,
    injection: replayInjection(options),
  });
  regression.injection = sanitizedReplay.branch.injection;
  const assertions = options.assertions?.length
    ? portableAssertions(options.assertions, sanitizedReplay, redactionPaths, replacements)
    : [];
  regression.assertions = assertions.length ? assertions : defaultAssertions(regression, sanitizedReplay);
  updateRedactions(regression, redactionPaths);
  regression.replay = { mode: "structural", confidence: sanitizedReplay.confidence };
  validateTape(regression);

  const directory = path.join(workspace, "tests", "agenttape");
  await mkdir(directory, { recursive: true });
  const resolvedDirectory = await realpath(directory);
  if (!isInside(workspace, resolvedDirectory)) {
    throw new AgentTapeAccessError("PATH_OUTSIDE_WORKSPACE", "Regression directory resolves outside the workspace.");
  }

  const filename = options.filename || `${regression.id}.tape`;
  if (!/^[A-Za-z0-9._-]+\.tape$/.test(filename)) {
    throw new AgentTapeAccessError("INVALID_FILENAME", "Regression filename must be a plain .tape filename.");
  }
  const destination = path.join(resolvedDirectory, filename);
  const flags = constants.O_WRONLY
    | constants.O_CREAT
    | (constants.O_NOFOLLOW || 0)
    | (options.overwrite ? constants.O_TRUNC : constants.O_EXCL);
  let handle;
  try {
    handle = await open(destination, flags, 0o600);
    await handle.writeFile(`${JSON.stringify(regression, null, 2)}\n`, "utf8");
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new AgentTapeAccessError("REGRESSION_EXISTS", "Regression already exists; set overwrite only after explicit confirmation.");
    }
    if (error.code === "ELOOP") {
      throw new AgentTapeAccessError("UNSAFE_FILE_TYPE", "Regression destination cannot be a symbolic link.");
    }
    throw error;
  } finally {
    await handle?.close();
  }

  return {
    path: path.relative(workspace, destination),
    tapeId: regression.id,
    branchId: result.branch.id,
    assertionCount: regression.assertions.length,
    replayConfidence: {
      score: sanitizedReplay.confidence.score,
      level: sanitizedReplay.confidence.level,
    },
  };
}
