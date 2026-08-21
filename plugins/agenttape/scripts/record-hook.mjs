#!/usr/bin/env node

import { recordHook } from "./tape-store.mjs";

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

try {
  const input = await readStdin();
  const payload = JSON.parse(input);
  await recordHook(payload);
  process.stdout.write("{}\n");
} catch (error) {
  process.stderr.write(`AgentTape recorder failed: ${error.message}\n`);
  process.exitCode = 1;
}
