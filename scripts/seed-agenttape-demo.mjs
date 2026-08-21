import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "plugins", "agenttape", "fixtures", "permission-denied.tape");
const directory = path.join(projectRoot, ".agent-tape", "tapes");
const destination = path.join(directory, "permission-denied.tape");

await mkdir(directory, { recursive: true });
try {
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  process.stdout.write("Seeded .agent-tape/tapes/permission-denied.tape\n");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  process.stdout.write("Demo tape already exists; left it unchanged.\n");
}
