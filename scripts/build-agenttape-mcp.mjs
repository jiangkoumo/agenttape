import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "plugins", "agenttape", "dist");
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [path.join(projectRoot, "plugins", "agenttape", "mcp", "server.mjs")],
  outfile: path.join(outputDirectory, "mcp-server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
});

console.log("Built plugins/agenttape/dist/mcp-server.mjs");
