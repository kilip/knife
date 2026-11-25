#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "../server/index.ts");

if (typeof Bun !== "undefined") {
  // Running directly under Bun
  await import(serverPath);
} else {
  // Running under Node.js, delegate to Bun
  const child = spawn("bun", ["run", serverPath, ...process.argv.slice(2)], {
    stdio: "inherit",
  });

  const signals = ["SIGTERM", "SIGINT", "SIGHUP"];
  const handlers = new Map();
  for (const signal of signals) {
    const handler = () => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }

  const cleanupHandlers = () => {
    for (const [signal, handler] of handlers) {
      process.off(signal, handler);
    }
  };

  child.on("error", (err) => {
    cleanupHandlers();
    if (err.code === "ENOENT") {
      console.error("\x1b[31mError: 'bun' was not found in your PATH.\x1b[0m");
      console.error("knife requires Bun (v1.2+) to run.");
      console.error("Please install Bun from https://bun.sh or add it to PATH.");
      process.exit(1);
    }
    throw err;
  });

  child.on("exit", (code, signal) => {
    cleanupHandlers();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}
