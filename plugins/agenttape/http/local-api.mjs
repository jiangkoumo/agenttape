import { AgentTapeAccessError, inspectWorkspaceTape, listWorkspaceTapes } from "../mcp/tape-access.mjs";
import { forkWorkspaceRun, saveWorkspaceRegression } from "../mcp/write-tools.mjs";
import { SUPPORTED_INJECTIONS } from "../replay/structural-replay.mjs";

const API_PREFIX = "/api/agenttape";
const MAX_REQUEST_BYTES = 65_536;
const TAPE_ID_PATTERN = /^tape_[A-Za-z0-9._-]+$/;
const FILENAME_PATTERN = /^[A-Za-z0-9._-]+\.tape$/;

class ApiRequestError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function requireTapeId(id) {
  if (typeof id !== "string" || !TAPE_ID_PATTERN.test(id)) {
    throw new ApiRequestError("INVALID_TAPE_ID", "Tape ID is invalid.");
  }
  return id;
}

function requirePositiveInteger(value, label, optional = false) {
  if (optional && value == null) return undefined;
  if (!Number.isInteger(value) || value < 1) {
    throw new ApiRequestError("INVALID_REQUEST", `${label} must be a positive integer.`);
  }
  return value;
}

function branchOptions(body, { allowSave = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiRequestError("INVALID_REQUEST", "Request body must be a JSON object.");
  }
  if (!SUPPORTED_INJECTIONS.includes(body.injection)) {
    throw new ApiRequestError("INVALID_INJECTION", "Injection kind is not supported.");
  }
  if (allowSave && body.filename != null && !FILENAME_PATTERN.test(body.filename)) {
    throw new ApiRequestError("INVALID_FILENAME", "Regression filename must be a plain .tape filename.");
  }
  if (allowSave && body.overwrite === true) {
    throw new ApiRequestError("OVERWRITE_NOT_ALLOWED", "The local UI never overwrites an existing regression.", 409);
  }
  return {
    id: requireTapeId(body.id),
    boundarySequence: requirePositiveInteger(body.boundarySequence, "boundarySequence"),
    ...(body.targetSequence == null ? {} : {
      targetSequence: requirePositiveInteger(body.targetSequence, "targetSequence", true),
    }),
    injection: body.injection,
    ...(body.timeoutMs == null ? {} : {
      timeoutMs: requirePositiveInteger(body.timeoutMs, "timeoutMs", true),
    }),
    ...(body.maxBytes == null ? {} : {
      maxBytes: requirePositiveInteger(body.maxBytes, "maxBytes", true),
    }),
    ...(allowSave && body.filename ? { filename: body.filename } : {}),
    ...(allowSave ? { overwrite: false } : {}),
  };
}

function errorResponse(error) {
  if (error instanceof ApiRequestError) {
    return { status: error.status, body: { error: { code: error.code, message: error.message } } };
  }
  if (error instanceof AgentTapeAccessError) {
    const status = error.code === "TAPE_NOT_FOUND" ? 404 : error.code === "REGRESSION_EXISTS" ? 409 : 400;
    return { status, body: { error: { code: error.code, message: error.message } } };
  }
  return {
    status: 500,
    body: { error: { code: "AGENTTAPE_API_FAILED", message: "AgentTape could not complete the request." } },
  };
}

export async function executeAgentTapeApi(workspaceRoot, request) {
  try {
    if (request.method === "GET" && request.pathname === `${API_PREFIX}/tapes`) {
      const rawLimit = request.searchParams?.get("limit");
      const limit = rawLimit == null ? 50 : Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new ApiRequestError("INVALID_LIMIT", "limit must be an integer between 1 and 100.");
      }
      return { status: 200, body: await listWorkspaceTapes(workspaceRoot, limit) };
    }

    if (request.method === "GET" && request.pathname.startsWith(`${API_PREFIX}/tapes/`)) {
      const id = requireTapeId(decodeURIComponent(request.pathname.slice(`${API_PREFIX}/tapes/`.length)));
      return { status: 200, body: await inspectWorkspaceTape(workspaceRoot, id) };
    }

    if (request.method === "POST" && request.pathname === `${API_PREFIX}/forks`) {
      return { status: 200, body: await forkWorkspaceRun(workspaceRoot, branchOptions(request.body)) };
    }

    if (request.method === "POST" && request.pathname === `${API_PREFIX}/regressions`) {
      return { status: 201, body: await saveWorkspaceRegression(workspaceRoot, branchOptions(request.body, { allowSave: true })) };
    }

    return { status: 404, body: { error: { code: "NOT_FOUND", message: "AgentTape API route not found." } } };
  } catch (error) {
    return errorResponse(error);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new ApiRequestError("REQUEST_TOO_LARGE", "Request body is too large.", 413);
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiRequestError("INVALID_JSON", "Request body is not valid JSON.");
  }
}

function sendJson(response, result) {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(result.body));
}

function middleware(workspaceRoot) {
  return async (request, response, next) => {
    const url = new URL(request.url || "/", "http://agenttape.local");
    if (!url.pathname.startsWith(API_PREFIX)) return next();

    try {
      const body = request.method === "POST" ? await readJsonBody(request) : undefined;
      sendJson(response, await executeAgentTapeApi(workspaceRoot, {
        method: request.method,
        pathname: url.pathname,
        searchParams: url.searchParams,
        body,
      }));
    } catch (error) {
      sendJson(response, errorResponse(error));
    }
  };
}

export function agentTapeLocalApiPlugin({ workspaceRoot }) {
  const install = (server) => {
    server.middlewares.use(middleware(workspaceRoot));
  };
  return {
    name: "agenttape-local-api",
    configureServer: install,
    configurePreviewServer: install,
  };
}
