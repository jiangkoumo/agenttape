import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "plugins", "agenttape", "dist");
await mkdir(outputDirectory, { recursive: true });

const bundles = [
  ["mcp/server.mjs", "mcp-server.mjs"],
  ["scripts/agenttape.mjs", "agenttape-cli.mjs"],
  ["scripts/verify-capture.mjs", "verify-capture.mjs"],
];

for (const [entry, output] of bundles) {
  await build({
    entryPoints: [path.join(projectRoot, "plugins", "agenttape", entry)],
    outfile: path.join(outputDirectory, output),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
  });
}

console.log(`Built ${bundles.map(([, output]) => `plugins/agenttape/dist/${output}`).join(", ")}`);
