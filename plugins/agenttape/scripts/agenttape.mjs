#!/usr/bin/env node

import { copyFile, mkdir, readFile } from "node:fs/promises";
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
        reason: firstFailure.tool.failure.reason,
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
    "  agenttape.mjs test <path>",
  ].join("\n");
}

const args = process.argv.slice(2);
const command = args[0];
const root = path.resolve(option(args, "--root") || process.cwd());

if (command === "validate" || command === "test") {
  if (!args[1]) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
  } else {
    const { TapeValidationError, parseTape } = await import("./tape-schema.mjs");
    try {
      const file = path.resolve(args[1]);
      const tape = parseTape(await readFile(file, "utf8"));
      if (command === "validate") {
        console.log(`valid ${tape.id} v${tape.version}`);
      } else {
        const { runRegressionTape } = await import("../replay/assertions.mjs");
        const result = runRegressionTape(tape);
        if (result.passed) {
          console.log(`PASS ${tape.id} ${result.summary.passed}/${result.summary.total} assertions`);
        } else {
          process.stderr.write(`FAIL ${tape.id}\n`);
          if (result.error) process.stderr.write(`- ${result.error.code}: ${result.error.message}\n`);
          for (const assertion of result.assertions.filter((item) => !item.passed)) {
            const expected = JSON.stringify(redact(assertion.expected));
            const actual = JSON.stringify(redact(assertion.actual));
            process.stderr.write(`- [${assertion.kind}] expected ${expected}, received ${actual}\n`);
          }
          process.exitCode = 1;
        }
      }
    } catch (error) {
      if (error instanceof TapeValidationError) {
        process.stderr.write(`${error.code}: ${error.message}\n`);
        process.exitCode = 1;
      } else {
        throw error;
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
