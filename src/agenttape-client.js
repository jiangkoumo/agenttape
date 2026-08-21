export class AgentTapeClientError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = "AgentTapeClientError";
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new AgentTapeClientError(
      "API_UNAVAILABLE",
      "The local AgentTape API is unavailable. Open this build through AgentTape dev or preview mode.",
      0,
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AgentTapeClientError("INVALID_API_RESPONSE", "AgentTape returned an invalid response.", response.status);
  }
  if (!response.ok) {
    throw new AgentTapeClientError(
      payload?.error?.code || "AGENTTAPE_REQUEST_FAILED",
      payload?.error?.message || "AgentTape could not complete the request.",
      response.status,
    );
  }
  return payload;
}

export function listTapes(fetchImpl) {
  return request("/api/agenttape/tapes?limit=100", {}, fetchImpl);
}

export function inspectTape(id, fetchImpl) {
  return request(`/api/agenttape/tapes/${encodeURIComponent(id)}`, {}, fetchImpl);
}

export function forkTape(options, fetchImpl) {
  return request("/api/agenttape/forks", { method: "POST", body: JSON.stringify(options) }, fetchImpl);
}

export function saveRegression(options, fetchImpl) {
  return request("/api/agenttape/regressions", { method: "POST", body: JSON.stringify(options) }, fetchImpl);
}

export function loadDemo(fetchImpl) {
  return request("/demo/agenttape-demo.json", {}, fetchImpl);
}
