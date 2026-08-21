import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const viteBin = resolve(projectRoot, "node_modules/vite/bin/vite.js");
const viteArguments = process.argv.slice(2);

let temporaryDirectory;
let viteRoot = projectRoot;

if (projectRoot.includes("#")) {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "agenttape-vite-"));
  viteRoot = join(temporaryDirectory, "root");
  symlinkSync(projectRoot, viteRoot, "dir");
}

const [command, ...commandArguments] = viteArguments;
const viteCommand = command === "build" || command === "preview"
  ? [viteBin, command, viteRoot, ...commandArguments]
  : [viteBin, viteRoot, ...viteArguments];

const child = spawn(process.execPath, viteCommand, {
  cwd: projectRoot,
  stdio: "inherit",
});

function cleanup() {
  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  cleanup();
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  cleanup();
  process.exitCode = signal ? 1 : (code ?? 1);
});
