import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("publishes a Git-installable AgentTape marketplace", async () => {
  const marketplace = await readJson(".agents/plugins/marketplace.json");
  const manifest = await readJson("plugins/agenttape/.codex-plugin/plugin.json");
  const packageMetadata = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const bundledServer = await readFile(new URL("plugins/agenttape/dist/mcp-server.mjs", root), "utf8");
  const bundledCli = await readFile(new URL("plugins/agenttape/dist/agenttape-cli.mjs", root), "utf8");
  const bundledVerifier = await readFile(new URL("plugins/agenttape/dist/verify-capture.mjs", root), "utf8");
  const localServer = await readFile(new URL("plugins/agenttape/mcp/server.mjs", root), "utf8");
  const remoteServer = await readFile(new URL("plugins/agenttape/mcp/remote-server.mjs", root), "utf8");
  const remoteWorker = await readFile(new URL("remote/worker.mjs", root), "utf8");
  const changelog = await readFile(new URL("CHANGELOG.md", root), "utf8");
  const reviewedRegression = await readFile(
    new URL("tests/agenttape/real-agenttape-list-tapes-malformed-json.tape", root),
    "utf8",
  );
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
  assert.equal(packageLock.version, packageMetadata.version);
  assert.equal(packageLock.packages[""].version, packageMetadata.version);
  assert.ok(localServer.includes(`version: "${packageMetadata.version}"`));
  assert.ok(remoteServer.includes(`version: "${packageMetadata.version}"`));
  assert.ok(remoteWorker.includes(`version: "${packageMetadata.version}"`));
  assert.ok(changelog.includes(`## ${packageMetadata.version} -`));
  assert.match(reviewedRegression, /"id": "tape_regression_/);
  if (process.env.GITHUB_REF_TYPE === "tag") {
    assert.equal(process.env.GITHUB_REF_NAME, `v${packageMetadata.version}`);
  }
  assert.match(bundledServer, /createAgentTapeServer/);
  assert.match(bundledCli, /PASS.*regression tapes/);
  assert.match(bundledVerifier, /obviousSecretPresent/);
  assert.match(readme, /codex plugin marketplace add jiangkoumo\/agenttape/);
  assert.match(readme, /codex plugin add agenttape@agenttape/);
  assert.doesNotMatch(readme, /agenttape@personal/);
});

test("bundled AgentTape tools run outside the repository without installed dependencies", async (t) => {
  const installRoot = await mkdtemp(path.join(tmpdir(), "agenttape-install-"));
  t.after(() => rm(installRoot, { recursive: true, force: true }));

  const cliPath = path.join(installRoot, "agenttape-cli.mjs");
  const verifierPath = path.join(installRoot, "verify-capture.mjs");
  const fixtureDir = path.join(installRoot, "tests", "agenttape");
  await mkdir(fixtureDir, { recursive: true });
  await copyFile(new URL("plugins/agenttape/dist/agenttape-cli.mjs", root), cliPath);
  await copyFile(new URL("plugins/agenttape/dist/verify-capture.mjs", root), verifierPath);
  await copyFile(
    new URL("tests/agenttape/fixture_permission_denied-timeout.tape", root),
    path.join(fixtureDir, "fixture_permission_denied-timeout.tape"),
  );

  const result = spawnSync(process.execPath, [cliPath, "test", fixtureDir], {
    cwd: installRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS tape_regression_[A-Za-z0-9]+ 4\/4 assertions/);
  assert.match(result.stdout, /PASS 1\/1 regression tapes/);

  const verifier = spawnSync(process.execPath, [verifierPath, "--help"], {
    cwd: installRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(verifier.status, 0, verifier.stderr || verifier.stdout);
  assert.match(verifier.stdout, /verify-capture\.mjs \[--root <project>\]/);
});
