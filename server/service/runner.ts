import { spawnSync } from "node:child_process";
import type { CommandResult, CommandRunner } from "./types";

export class DefaultCommandRunner implements CommandRunner {
  run(
    cmd: string,
    args: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): CommandResult {
    try {
      const result = spawnSync(cmd, args, {
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : process.env,
        encoding: "utf-8",
      });

      if (result.error) {
        return {
          exitCode: 1,
          stdout: result.stdout || "",
          stderr: result.stderr || result.error.message || String(result.error),
        };
      }

      return {
        exitCode: result.status ?? 0,
        stdout: (result.stdout || "").trim(),
        stderr: (result.stderr || "").trim(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        stdout: "",
        stderr: message,
      };
    }
  }
}

export const defaultRunner = new DefaultCommandRunner();
