import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { getServiceManager } from "./service/factory";
import type { ServiceCliOptions } from "./service/types";

export interface VersionParts {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  publishedAt?: string;
  cached?: boolean;
}

export type PackageManager = "bun" | "npm";

export interface PackageManagerInfo {
  type: PackageManager;
  command: string;
  args: string[];
}

let cachedCheckResult: {
  result: VersionCheckResult;
  timestamp: number;
} | null = null;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Parse semver string (e.g. "1.1.0", "v1.2.3-beta.1") into numeric components.
 */
export function parseSemver(version: string): VersionParts | null {
  const clean = version.trim().replace(/^v/i, "");
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

/**
 * Compare two semver strings.
 * Returns:
 *   1 if a > b
 *  -1 if a < b
 *   0 if a === b
 */
export function compareSemver(a: string, b: string): number {
  const vA = parseSemver(a);
  const vB = parseSemver(b);

  if (!vA && !vB) return a.localeCompare(b);
  if (!vA) return -1;
  if (!vB) return 1;

  if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1;
  if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1;
  if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1;

  // Prerelease comparison: non-prerelease > prerelease
  if (!vA.prerelease && vB.prerelease) return 1;
  if (vA.prerelease && !vB.prerelease) return -1;
  if (vA.prerelease && vB.prerelease) {
    return vA.prerelease.localeCompare(vB.prerelease);
  }

  return 0;
}

/**
 * Read current version from package.json
 */
export function getCurrentVersion(): string {
  try {
    const pkgPath = resolve(import.meta.dir, "../package.json");
    if (existsSync(pkgPath)) {
      const data = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (typeof data.version === "string") return data.version;
    }
  } catch {
    // fallback
  }
  return "1.0.0";
}

/**
 * Check npm registry for latest version of @kilip/knife.
 * Caches result in memory for 1 hour unless force is true.
 */
export async function checkLatestVersion(
  currentVersion: string = getCurrentVersion(),
  force: boolean = false,
  fetchFn: typeof fetch = fetch,
): Promise<VersionCheckResult> {
  const now = Date.now();
  if (!force && cachedCheckResult && now - cachedCheckResult.timestamp < CACHE_TTL_MS) {
    return {
      ...cachedCheckResult.result,
      cached: true,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetchFn("https://registry.npmjs.org/@kilip/knife/latest", {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Registry responded with HTTP ${res.status}`);
    }

    const data = (await res.json()) as { version?: string; time?: { modified?: string } };
    const latestVersion = data.version || currentVersion;
    const updateAvailable = compareSemver(latestVersion, currentVersion) > 0;

    const result: VersionCheckResult = {
      currentVersion,
      latestVersion,
      updateAvailable,
      cached: false,
    };

    cachedCheckResult = {
      result,
      timestamp: now,
    };

    return result;
  } catch (err: unknown) {
    // If registry check fails, return current version as latest with updateAvailable false
    const fallback: VersionCheckResult = {
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      cached: false,
    };
    return fallback;
  }
}

/**
 * Clear the version check cache (mainly for testing)
 */
export function clearVersionCache(): void {
  cachedCheckResult = null;
}

/**
 * Detect runtime and package manager to construct update command.
 */
export function detectPackageManager(
  execPath: string = process.execPath,
  env: NodeJS.ProcessEnv = process.env,
  isBunRuntime: boolean = typeof Bun !== "undefined",
): PackageManagerInfo {
  const isBun = isBunRuntime || execPath.toLowerCase().includes("bun") || !!env.BUN_INSTALL;
  if (isBun) {
    return {
      type: "bun",
      command: "bun",
      args: ["add", "-g", "@kilip/knife@latest"],
    };
  }

  return {
    type: "npm",
    command: "npm",
    args: ["install", "-g", "@kilip/knife@latest"],
  };
}

/**
 * Execute package update command and stream output lines.
 */
export async function executePackageUpdate(
  onLog: (line: string) => void,
  pkgManager: PackageManagerInfo = detectPackageManager(),
  spawnFn: typeof spawn = spawn,
): Promise<{ success: boolean; exitCode: number; error?: string }> {
  const fullCmd = `${pkgManager.command} ${pkgManager.args.join(" ")}`;
  onLog(`[update] Running: ${fullCmd}`);

  return new Promise((res) => {
    try {
      const child = spawnFn(pkgManager.command, pkgManager.args, {
        env: { ...process.env },
      });

      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            onLog(line);
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            onLog(line);
          }
        }
      });

      child.on("error", (err: Error) => {
        onLog(`[update] Failed to execute update: ${err.message}`);
        res({ success: false, exitCode: 1, error: err.message });
      });

      child.on("close", (code: number | null) => {
        const exitCode = code ?? 0;
        if (exitCode === 0) {
          onLog("[update] Package update completed successfully.");
          res({ success: true, exitCode: 0 });
        } else {
          onLog(`[update] Command failed with exit code ${exitCode}`);
          res({
            success: false,
            exitCode,
            error: `Process exited with code ${exitCode}`,
          });
        }
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onLog(`[update] Process execution error: ${msg}`);
      res({ success: false, exitCode: 1, error: msg });
    }
  });
}

/**
 * Check if Knife is currently managed by OS service manager.
 */
export async function isManagedService(
  serviceName: string = "knife",
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  try {
    const manager = getServiceManager(platform);
    const status = await manager.status({
      action: "status",
      name: serviceName,
      system: false,
      env: {},
    });
    return status.installed && status.active;
  } catch {
    return false;
  }
}

/**
 * Trigger service restart or graceful process respawn.
 */
export async function triggerRestart(options?: {
  serviceName?: string;
  isService?: boolean;
  onBeforeExit?: () => Promise<void>;
}): Promise<void> {
  const serviceName = options?.serviceName || "knife";
  const managed =
    options?.isService !== undefined ? options.isService : await isManagedService(serviceName);

  if (managed) {
    const manager = getServiceManager(process.platform);
    const serviceOpts: ServiceCliOptions = {
      action: "restart",
      name: serviceName,
      system: false,
      env: {},
    };
    // Give time for SSE stream to deliver completion payload before restarting
    setTimeout(async () => {
      try {
        if (options?.onBeforeExit) {
          await options.onBeforeExit();
        }
        await manager.restart(serviceOpts);
      } catch (err) {
        console.error("[update] Service restart failed:", err);
        process.exit(0);
      }
    }, 1200);
    return;
  }

  // Unmanaged: Detached respawn of the same binary / arguments, then exit
  setTimeout(async () => {
    try {
      if (options?.onBeforeExit) {
        await options.onBeforeExit();
      }
      const [execPath, ...args] = process.argv;
      const child = spawn(execPath, args, {
        detached: true,
        stdio: "inherit",
        env: { ...process.env },
      });
      child.unref();
      process.exit(0);
    } catch (err) {
      console.error("[update] Respawn failed:", err);
      process.exit(1);
    }
  }, 1200);
}
