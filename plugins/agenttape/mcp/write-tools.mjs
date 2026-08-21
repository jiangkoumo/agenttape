import { constants } from "node:fs";
import { mkdir, open, realpath } from "node:fs/promises";
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

export async function forkWorkspaceRun(workspaceRoot, options) {
  const tape = await loadWorkspaceTape(workspaceRoot, options.id);
  return structuralReplay(tape, {
    boundarySequence: options.boundarySequence,
    targetSequence: options.targetSequence,
    injection: {
      kind: options.injection,
      ...((options.timeoutMs || options.maxBytes) ? {
        parameters: {
          ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
          ...(options.maxBytes ? { maxBytes: options.maxBytes } : {}),
        },
      } : {}),
    },
  });
}

export async function saveWorkspaceRegression(workspaceRoot, options) {
  const tape = await loadWorkspaceTape(workspaceRoot, options.id);
  const result = await forkWorkspaceRun(workspaceRoot, options);
  if (result.status !== "completed") {
    throw new AgentTapeAccessError("REPLAY_NOT_EXECUTABLE", result.reason);
  }

  const regression = structuredClone(tape);
  regression.id = `tape_regression_${result.branch.id.slice("branch_".length)}`;
  regression.fork = {
    sourceTapeId: tape.id,
    boundarySequence: options.boundarySequence,
    createdAt: tape.completedAt,
  };
  regression.injection = result.branch.injection;
  regression.assertions = options.assertions?.length ? structuredClone(options.assertions) : defaultAssertions(tape, result);
  regression.replay = { mode: "structural", confidence: result.confidence };
  validateTape(regression);

  const workspace = await realpath(path.resolve(workspaceRoot));
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
      score: result.confidence.score,
      level: result.confidence.level,
    },
  };
}
