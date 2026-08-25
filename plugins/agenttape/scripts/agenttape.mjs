#!/usr/bin/env node

import { copyFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { listTapes, redact } from "./tape-store.mjs";

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function summarize(entry) {
  const firstFailure = entry.tape.events.find((event) => event.tool?.failed);
  return {
    path: entry.file,
    id: entry.tape.id,
    status: entry.tape.status,
    capturedAt: entry.tape.capturedAt,
    toolCallCount: entry.tape.summary.toolCallCount,
    failedToolCallCount: entry.tape.summary.failedToolCallCount,
    ...(firstFailure ? {
      firstFailure: {
        sequence: firstFailure.sequence,
        toolName: firstFailure.tool.name,
        reason: firstFailure.tool.failure?.reason || "Recorded tool failure",
      },
    } : {}),
  };
}

function usage() {
  return [
    "Usage:",
    "  agenttape.mjs list [--json] [--root <project>]",
    "  agenttape.mjs latest [--json] [--root <project>]",
    "  agenttape.mjs export latest --output <path> [--root <project>]",
    "  agenttape.mjs validate <path>",
    "  agenttape.mjs test <file-or-directory>",
  ].join("\n");
}

async function regressionFiles(target) {
  const metadata = await stat(target);
  if (!metadata.isDirectory()) return [target];
  return (await readdir(target, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tape"))
    .map((entry) => path.join(target, entry.name))
    .sort();
}

async function testRegressionFile(file) {
  const { TapeValidationError, parseTape } = await import("./tape-schema.mjs");
  try {
    const tape = parseTape(await readFile(file, "utf8"));
    const { runRegressionTape } = await import("../replay/assertions.mjs");
    const result = runRegressionTape(tape);
    if (result.passed) {
      console.log(`PASS ${tape.id} ${result.summary.passed}/${result.summary.total} assertions`);
      return true;
    }

    process.stderr.write(`FAIL ${tape.id}\n`);
    if (result.error) process.stderr.write(`- ${result.error.code}: ${result.error.message}\n`);
    for (const assertion of result.assertions.filter((item) => !item.passed)) {
      const expected = JSON.stringify(redact(assertion.expected));
      const actual = JSON.stringify(redact(assertion.actual));
      process.stderr.write(`- [${assertion.kind}] expected ${expected}, received ${actual}\n`);
    }
    return false;
  } catch (error) {
    if (!(error instanceof TapeValidationError)) throw error;
    process.stderr.write(`${path.basename(file)}: ${error.code}: ${error.message}\n`);
    return false;
  }
}

const args = process.argv.slice(2);
const command = args[0];
const root = path.resolve(option(args, "--root") || process.cwd());

if (command === "validate" || command === "test") {
  if (!args[1]) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
  } else {
    const file = path.resolve(args[1]);
    if (command === "validate") {
      const { TapeValidationError, parseTape } = await import("./tape-schema.mjs");
      try {
        const tape = parseTape(await readFile(file, "utf8"));
        console.log(`valid ${tape.id} v${tape.version}`);
      } catch (error) {
        if (error instanceof TapeValidationError) {
          process.stderr.write(`${error.code}: ${error.message}\n`);
          process.exitCode = 1;
        } else {
          throw error;
        }
      }
    } else {
      const files = await regressionFiles(file);
      if (!files.length) {
        process.stderr.write(`No .tape regression files found in ${file}.\n`);
        process.exitCode = 2;
      } else {
        const results = [];
        for (const tapeFile of files) results.push(await testRegressionFile(tapeFile));
        if (files.length > 1 || (await stat(file)).isDirectory()) {
          console.log(`${results.every(Boolean) ? "PASS" : "FAIL"} ${results.filter(Boolean).length}/${files.length} regression tapes`);
        }
        if (!results.every(Boolean)) process.exitCode = 1;
      }
    }
  }
} else if (command === "list") {
  const entries = await listTapes(root);
  const summaries = entries.map(summarize);
  if (args.includes("--json")) console.log(JSON.stringify(summaries, null, 2));
  else if (!summaries.length) console.log("No AgentTape captures found.");
  else summaries.forEach((item) => console.log(`${item.status.padEnd(8)} ${item.id} ${item.toolCallCount} tools ${item.path}`));
} else if (command === "latest") {
  const entries = await listTapes(root);
  if (!entries.length) {
    process.stderr.write("No AgentTape captures found.\n");
    process.exitCode = 2;
  } else {
    const summary = summarize(entries[0]);
    console.log(args.includes("--json") ? JSON.stringify(summary, null, 2) : `${summary.status} ${summary.path}`);
  }
} else if (command === "export" && args[1] === "latest") {
  const entries = await listTapes(root);
  const output = option(args, "--output");
  if (!output) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
  } else if (!entries.length) {
    process.stderr.write("No AgentTape captures found.\n");
    process.exitCode = 2;
  } else {
    const destination = path.resolve(root, output);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(entries[0].file, destination);
    console.log(destination);
  }
} else {
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 2;
}
