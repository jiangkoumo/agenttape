import { createMcpHandler } from "@modelcontextprotocol/server";

import { createRemoteAgentTapeServer } from "../plugins/agenttape/mcp/remote-server.mjs";

const MAX_HTTP_BODY_BYTES = 1_100_000;
const DEFAULT_ALLOWED_ORIGINS = ["https://chatgpt.com", "https://platform.openai.com"];
const handler = createMcpHandler(() => createRemoteAgentTapeServer(), {
  legacy: "stateless",
  responseMode: "auto",
  keepAliveMs: 0,
  onerror: () => {},
});

function withSecurityHeaders(response, origin) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(value, status = 200) {
  return withSecurityHeaders(new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }));
}

function html(title, body) {
  const document = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body><main><h1>${title}</h1>${body}</main></body></html>`;
  return withSecurityHeaders(new Response(document, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

function allowedOrigins(env) {
  return new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...String(env.AGENTTAPE_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
  ]);
}

function validateOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  return allowedOrigins(env).has(origin) ? origin : false;
}

async function boundedRequest(request) {
  if (request.method !== "POST") return request;
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_HTTP_BODY_BYTES) return null;
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_HTTP_BODY_BYTES) return null;
  return new Request(request, { body });
}

export async function handleAgentTapeRemoteRequest(request, env = {}) {
  const url = new URL(request.url);
  const origin = validateOrigin(request, env);
  if (origin === false) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);

  if (url.pathname === "/health" && request.method === "GET") {
    return json({ service: "agenttape-remote", version: "0.3.0", status: "ok", storage: "none" });
  }
  if (url.pathname === "/privacy" && request.method === "GET") {
    return html("AgentTape Remote Privacy", "<p>The service processes caller-supplied, explicitly redacted AgentTape documents in memory. It does not persist tape contents, read local files, call models, or call live tools. Infrastructure may retain ordinary request metadata for security and reliability.</p>");
  }
  if (url.pathname === "/terms" && request.method === "GET") {
    return html("AgentTape Remote Terms", "<p>The service provides best-effort structural inspection and offline replay evidence. It does not provide bit-exact or complete replay and must not be used as the sole basis for consequential decisions.</p>");
  }
  if (url.pathname === "/support" && request.method === "GET") {
    return html("AgentTape Support", "<p>Use the AgentTape project support channel supplied with the plugin listing and include only redacted diagnostics.</p>");
  }
  if (url.pathname === "/.well-known/openai-apps-challenge" && request.method === "GET") {
    if (!env.OPENAI_APPS_CHALLENGE) return new Response("Not found", { status: 404 });
    return withSecurityHeaders(new Response(String(env.OPENAI_APPS_CHALLENGE), { headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  }
  if (url.pathname === "/" && request.method === "GET") {
    const website = env.AGENTTAPE_WEBSITE_URL || "https://agenttape.jiangkoumo.chatgpt.site";
    return html("AgentTape Remote MCP", `<p>Stateless processing for caller-supplied, redacted AgentTape v1 documents.</p><ul><li><a href="/health">Health</a></li><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li><li><a href="/support">Support</a></li><li><a href="${website}">Branch Canvas</a></li></ul>`);
  }
  if (url.pathname !== "/mcp") return json({ error: "NOT_FOUND" }, 404);

  if (request.method === "OPTIONS") {
    const response = new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id",
        "Access-Control-Max-Age": "600",
      },
    });
    return withSecurityHeaders(response, origin || undefined);
  }

  const bounded = await boundedRequest(request);
  if (!bounded) return json({ error: "REQUEST_TOO_LARGE", maxBytes: MAX_HTTP_BODY_BYTES }, 413);
  return withSecurityHeaders(await handler.fetch(bounded), origin || undefined);
}

export default { fetch: handleAgentTapeRemoteRequest };
