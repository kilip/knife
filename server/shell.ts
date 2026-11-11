import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { basename } from "node:path";

let cachedUserShell: string | null = null;

/**
 * Detects the user's default login shell.
 * Priority:
 * 1. process.env.SHELL
 * 2. os.userInfo().shell (if valid and not 'unknown')
 * 3. /etc/passwd entry for current user / uid
 * 4. Common shells check (zsh, fish, bash, sh)
 * 5. Fallback to /bin/sh
 */
export function getUserShell(): string {
  if (cachedUserShell && existsSync(cachedUserShell)) {
    return cachedUserShell;
  }

  // 1. process.env.SHELL
  if (process.env.SHELL && existsSync(process.env.SHELL)) {
    cachedUserShell = process.env.SHELL;
    return cachedUserShell;
  }

  // 2. os.userInfo().shell
  try {
    const info = os.userInfo();
    if (info.shell && info.shell !== "unknown" && existsSync(info.shell)) {
      cachedUserShell = info.shell;
      return cachedUserShell;
    }
  } catch {}

  // 3. /etc/passwd parsing for Linux/POSIX
  try {
    if (existsSync("/etc/passwd")) {
      const passwdContent = readFileSync("/etc/passwd", "utf-8");
      const user = os.userInfo()?.username || process.env.USER;
      const uid = os.userInfo()?.uid;

      for (const line of passwdContent.split("\n")) {
        const parts = line.split(":");
        if (parts.length >= 7) {
          if ((user && parts[0] === user) || (uid !== undefined && parts[2] === String(uid))) {
            const shellCandidate = parts[6].trim();
            if (shellCandidate && existsSync(shellCandidate)) {
              cachedUserShell = shellCandidate;
              return cachedUserShell;
            }
          }
        }
      }
    }
  } catch {}

  // 4. Common standard shell paths
  const candidateShells = [
    "/usr/bin/zsh",
    "/bin/zsh",
    "/usr/bin/fish",
    "/bin/fish",
    "/usr/bin/bash",
    "/bin/bash",
    "/bin/sh",
    "/usr/bin/sh",
  ];

  for (const candidate of candidateShells) {
    if (existsSync(candidate)) {
      cachedUserShell = candidate;
      return cachedUserShell;
    }
  }

  // 5. Final fallback
  return "/bin/sh";
}

/**
 * Returns human-readable shell name (e.g. 'zsh', 'fish', 'bash').
 */
export function getShellName(shellPath?: string): string {
  const targetPath = shellPath || getUserShell();
  const name = basename(targetPath).toLowerCase();
  return name || "shell";
}

/**
 * Checks whether tmux binary is available on the system.
 */
export function isTmuxInstalled(): boolean {
  try {
    const path = Bun.which("tmux");
    return path !== null;
  } catch {
    return false;
  }
}
