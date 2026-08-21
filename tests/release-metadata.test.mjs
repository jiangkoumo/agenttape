import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("publishes a Git-installable AgentTape marketplace", async () => {
  const marketplace = await readJson(".agents/plugins/marketplace.json");
  const manifest = await readJson("plugins/agenttape/.codex-plugin/plugin.json");
  const packageMetadata = await readJson("package.json");
  const bundledServer = await readFile(new URL("plugins/agenttape/dist/mcp-server.mjs", root), "utf8");
  const readme = await readFile(new URL("README.md", root), "utf8");

  assert.equal(marketplace.name, "agenttape");
  assert.equal(marketplace.interface.displayName, "AgentTape");
  assert.deepEqual(marketplace.plugins.map(({ name, source }) => ({ name, source })), [{
    name: "agenttape",
    source: { source: "local", path: "./plugins/agenttape" },
  }]);
  assert.equal(manifest.name, "agenttape");
  assert.equal(manifest.repository, "https://github.com/jiangkoumo/agenttape");
  assert.equal(manifest.homepage, "https://github.com/jiangkoumo/agenttape#readme");
  assert.equal(manifest.version, packageMetadata.version);
  assert.match(bundledServer, /createAgentTapeServer/);
  assert.match(readme, /codex plugin marketplace add jiangkoumo\/agenttape/);
  assert.match(readme, /codex plugin add agenttape@agenttape/);
  assert.doesNotMatch(readme, /agenttape@personal/);
});
