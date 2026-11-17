import os from "node:os";
import { join, resolve } from "node:path";
import { resolveConfigPath } from "../../config";
import { resolveDataDir } from "../tabs/store";

export const SYSTEM_PROTECTED_PATHS = [
  "/",
  "/boot",
  "/etc",
  "/sys",
  "/proc",
  "/dev",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
];

export function getDefaultHome(): string {
  return process.env.HOME || os.homedir() || "/";
}

export function normalizePath(inputPath?: string | null): string {
  if (!inputPath || !inputPath.trim()) {
    return resolve(getDefaultHome());
  }
  const trimmed = inputPath.trim();
  const home = getDefaultHome();
  if (trimmed === "~") {
    return resolve(home);
  }
  if (trimmed.startsWith("~/")) {
    return resolve(join(home, trimmed.slice(2)));
  }
  return resolve(trimmed);
}

export function isProtectedPath(targetPath: string): boolean {
  const norm = normalizePath(targetPath);

  // Exact root
  if (norm === "/") return true;

  // System protected paths
  for (const p of SYSTEM_PROTECTED_PATHS) {
    if (p === "/") continue;
    if (norm === p || norm.startsWith(`${p}/`)) {
      return true;
    }
  }

  // Knife installation root and data
  const knifeRoot = resolve(process.cwd());
  const cwdData = resolve(join(process.cwd(), "data"));
  const cwdConfig = resolve(join(process.cwd(), "config.json"));
  const resolvedData = resolve(resolveDataDir());
  const resolvedConfig = resolve(resolveConfigPath());

  if (norm === knifeRoot) return true;
  if (norm === cwdData || norm.startsWith(`${cwdData}/`)) return true;
  if (norm === cwdConfig) return true;
  if (norm === resolvedData || norm.startsWith(`${resolvedData}/`)) return true;
  if (norm === resolvedConfig) return true;

  return false;
}
