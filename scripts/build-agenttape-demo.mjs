import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectTape, summarizeTape } from "../plugins/agenttape/mcp/tape-access.mjs";
import { structuralReplay, SUPPORTED_INJECTIONS } from "../plugins/agenttape/replay/structural-replay.mjs";
import { parseTape } from "../plugins/agenttape/scripts/tape-schema.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "plugins", "agenttape", "fixtures", "permission-denied.tape");
const destination = path.join(projectRoot, "public", "demo", "agenttape-demo.json");
const tape = parseTape(await readFile(source, "utf8"));
const targetSequence = tape.injection.targetSequence;
const boundarySequence = tape.fork.boundarySequence;
const forks = Object.fromEntries(SUPPORTED_INJECTIONS.map((kind) => [
  kind,
  structuralReplay(tape, { boundarySequence, targetSequence, injection: { kind } }),
]));

const payload = {
  format: "agenttape.demo",
  version: 1,
  generatedAt: tape.completedAt,
  list: { tapes: [summarizeTape(tape)], warnings: [], truncated: false },
  inspection: inspectTape(tape),
  forks,
};

await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write("Built public/demo/agenttape-demo.json\n");
