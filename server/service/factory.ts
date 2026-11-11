import { existsSync, readFileSync } from "node:fs";
import { LaunchdServiceManager } from "./managers/launchd";
import { SystemdServiceManager } from "./managers/systemd";
import { WindowsServiceManager } from "./managers/windows";
import { defaultRunner } from "./runner";
import type { CommandRunner, ServiceManager } from "./types";

/**
 * Checks whether the current environment is running under Windows Subsystem for Linux (WSL).
 */
export function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    if (existsSync("/proc/version")) {
      const version = readFileSync("/proc/version", "utf-8").toLowerCase();
      return version.includes("microsoft") || version.includes("wsl");
    }
  } catch {}
  return false;
}

/**
 * Platform manager factory.
 * Resolves the appropriate ServiceManager driver for Linux, macOS, or Windows.
 */
export function getServiceManager(
  platform: NodeJS.Platform = process.platform,
  runner: CommandRunner = defaultRunner,
): ServiceManager {
  switch (platform) {
    case "linux":
      return new SystemdServiceManager(runner);
    case "darwin":
      return new LaunchdServiceManager(runner);
    case "win32":
      return new WindowsServiceManager(runner);
    default:
      throw new Error(
        `Unsupported platform '${platform}' for Knife background service. Supported platforms: Linux (systemd), macOS (launchd), Windows.`,
      );
  }
}
