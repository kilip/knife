import { existsSync } from "node:fs";
import os from "node:os";
import { delimiter, join, resolve } from "node:path";
import { defaultRunner } from "./runner";
import type { CommandRunner } from "./types";

export interface PlatformPaths {
  homeDir: string;
  userConfigDir: string;
  userDataDir: string;
  userLogDir: string;
  systemLogDir: string;
}

/**
 * Resolves standard OS-specific directories for configuration, data, and logs.
 * Supports Linux (XDG) and macOS (Application Support & Logs).
 */
export function getPlatformPaths(
  serviceName: string = "knife",
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
  homeOverride?: string,
): PlatformPaths {
  const homeDir =
    homeOverride ||
    env.HOME ||
    env.USERPROFILE ||
    (() => {
      try {
        return os.homedir();
      } catch {
        return "/tmp";
      }
    })();

  if (platform === "darwin") {
    const appSupport = join(homeDir, "Library", "Application Support", serviceName);
    const logs = join(homeDir, "Library", "Logs", serviceName);
    return {
      homeDir,
      userConfigDir: appSupport,
      userDataDir: join(appSupport, "data"),
      userLogDir: logs,
      systemLogDir: join("/Library", "Logs", serviceName),
    };
  }

  // Linux / POSIX (XDG Base Directory specification)
  const xdgConfig = env.XDG_CONFIG_HOME || join(homeDir, ".config");
  const xdgData = env.XDG_DATA_HOME || join(homeDir, ".local", "share");
  const xdgState = env.XDG_STATE_HOME || join(homeDir, ".local", "state");

  return {
    homeDir,
    userConfigDir: join(xdgConfig, serviceName),
    userDataDir: join(xdgData, serviceName, "data"),
    userLogDir: join(xdgState, serviceName, "logs"),
    systemLogDir: join("/var", "log", serviceName),
  };
}

/**
 * Resolves the absolute path to the Bun executable.
 */
export function resolveBunExecutable(
  runner: CommandRunner = defaultRunner,
  _platform: NodeJS.Platform = process.platform,
): string {
  // 1. If currently running inside Bun, process.execPath is the exact bun binary
  if (
    process.execPath &&
    process.execPath.toLowerCase().includes("bun") &&
    existsSync(process.execPath)
  ) {
    return resolve(process.execPath);
  }

  // 2. Lookup via which
  const res = runner.run("which", ["bun"]);
  if (res.exitCode === 0 && res.stdout) {
    const firstMatch = res.stdout.split(/\r?\n/)[0]?.trim();
    if (firstMatch && existsSync(firstMatch)) {
      return resolve(firstMatch);
    }
  }

  // 3. Common user installation paths
  const home =
    process.env.HOME ||
    (() => {
      try {
        return os.homedir();
      } catch {
        return "";
      }
    })();
  const candidates = [
    join(home, ".bun", "bin", "bun"),
    "/usr/local/bin/bun",
    "/opt/homebrew/bin/bun",
    "/usr/bin/bun",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return resolve(candidate);
    }
  }

  return process.execPath || "bun";
}

/**
 * Resolves the absolute path to the Knife server entrypoint (`server/index.ts`).
 */
export function resolveEntrypointPath(): string {
  return resolve(import.meta.dir, "..", "index.ts");
}

/**
 * Builds a comprehensive PATH string preserving the user's current PATH,
 * the directory of the resolved Bun executable, and standard OS system paths.
 */
export function buildServicePath(
  bunPath: string,
  _platform: NodeJS.Platform = process.platform,
  currentPath: string = process.env.PATH || "",
): string {
  const sep = delimiter || ":";
  const bunDir = resolve(bunPath, "..");
  const existingParts = currentPath
    .split(sep)
    .map((p) => p.trim())
    .filter(Boolean);

  const defaultSystemPaths = [
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ];

  const merged = new Set<string>([bunDir, ...existingParts, ...defaultSystemPaths]);
  return Array.from(merged).join(sep);
}
