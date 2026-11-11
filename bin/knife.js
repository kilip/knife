#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "../server/index.ts");

if (typeof Bun !== "undefined") {
  // Running directly under Bun
  await import(serverPath);
} else {
  // Running under Node.js, delegate to Bun
  const result = spawnSync("bun", ["run", serverPath, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error("\x1b[31mError: 'bun' was not found in your PATH.\x1b[0m");
      console.error("knife requires Bun (v1.2+) to run.");
      console.error("Please install Bun from https://bun.sh or add it to PATH.");
      process.exit(1);
    }
    throw result.error;
  }
  process.exit(result.status ?? 0);
}
