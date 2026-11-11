import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TabData } from "./storage";

export const TMUX_SOCKET = "knife";

export const DEFAULT_TMUX_CONFIG = `# Knife tmux minimal configuration
# Isolated on dedicated socket (-L knife)

set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",*256col*:Tc,xterm*:Tc,alacritty:Tc"
set -g mouse on
set -s set-clipboard on
set -g history-limit 50000
set -s escape-time 10
set -g focus-events on
set -g status off
set -g destroy-unattached off
set -g remain-on-exit off
setw -g aggressive-resize on
set -g window-size latest
set-hook -g client-attached 'refresh-client'
`;

export function checkTmuxInstalled(): void {
  try {
    const proc = Bun.spawnSync(["tmux", "-V"]);
    if (proc.exitCode !== 0) {
      throw new Error("tmux exited with non-zero code");
    }
  } catch (err) {
    console.error("\n=======================================================");
    console.error("FATAL: tmux is not installed or not in PATH.");
    console.error("knife requires tmux to manage persistent terminal sessions.");
    console.error("Please install tmux using your system package manager:");
    console.error("  - Debian/Ubuntu: sudo apt-get install -y tmux");
    console.error("  - Arch Linux:    sudo pacman -S tmux");
    console.error("  - Fedora/RHEL:   sudo dnf install -y tmux");
    console.error("  - Alpine:        sudo apk add tmux");
    console.error("=======================================================\n");
    throw new Error("tmux is required but was not found on this system.");
  }
}

export function ensureTmuxConfigFile(): string {
  const confPath = process.env.KNIFE_TMUX_CONF || join(process.cwd(), "data", "knife-tmux.conf");
  const dir = dirname(confPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(confPath)) {
    writeFileSync(confPath, DEFAULT_TMUX_CONFIG, "utf-8");
  }
  return confPath;
}

export function listSessions(): string[] {
  const proc = Bun.spawnSync(["tmux", "-L", TMUX_SOCKET, "list-sessions", "-F", "#{session_name}"]);
  if (proc.exitCode !== 0) {
    return [];
  }
  return proc.stdout
    .toString()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasSession(sessionName: string): boolean {
  const proc = Bun.spawnSync(["tmux", "-L", TMUX_SOCKET, "has-session", "-t", sessionName]);
  return proc.exitCode === 0;
}

export function createSession(sessionName: string, cols: number = 80, rows: number = 24): void {
  const confPath = ensureTmuxConfigFile();
  if (hasSession(sessionName)) {
    return;
  }
  const proc = Bun.spawnSync([
    "tmux",
    "-L",
    TMUX_SOCKET,
    "-f",
    confPath,
    "new-session",
    "-d",
    "-s",
    sessionName,
    "-x",
    String(Math.max(10, cols)),
    "-y",
    String(Math.max(5, rows)),
  ]);
  if (proc.exitCode !== 0) {
    const err = proc.stderr.toString().trim();
    throw new Error(`Failed to create tmux session '${sessionName}': ${err}`);
  }
}

export function killSession(sessionName: string): boolean {
  if (!hasSession(sessionName)) {
    return true;
  }
  const proc = Bun.spawnSync(["tmux", "-L", TMUX_SOCKET, "kill-session", "-t", sessionName]);
  return proc.exitCode === 0;
}

/**
 * Reconciles saved tab list with active tmux sessions.
 * - Re-adopts live sessions (including any knife-* sessions found in tmux but not in tabs)
 * - Drops dead sessions (saved tabs whose tmux session no longer exists)
 * - If resulting tabs is empty, creates default "Shell 1" tab and session
 */
export function reconcileSessions(savedTabs: TabData[]): TabData[] {
  const liveSessions = new Set(listSessions());
  const reconciled: TabData[] = [];
  const knownSessionNames = new Set<string>();

  // 1. Keep saved tabs that are still live in tmux
  for (const tab of savedTabs) {
    if (liveSessions.has(tab.sessionName)) {
      reconciled.push(tab);
      knownSessionNames.add(tab.sessionName);
    } else {
      console.log(
        `[tmux] Session '${tab.sessionName}' for tab '${tab.name}' is dead. Dropping tab.`,
      );
    }
  }

  // 2. Re-adopt live knife-* sessions not in savedTabs
  let orderIndex = reconciled.length;
  for (const session of liveSessions) {
    if (session.startsWith("knife-") && !knownSessionNames.has(session)) {
      const id = session.replace(/^knife-/, "") || crypto.randomUUID().slice(0, 8);
      console.log(`[tmux] Adopting orphaned live session '${session}' as tab.`);
      reconciled.push({
        id,
        name: `Shell (${session.slice(0, 12)})`,
        sessionName: session,
        order: orderIndex++,
        createdAt: Date.now(),
      });
      knownSessionNames.add(session);
    }
  }

  // 3. If no tabs exist, create the initial tab
  if (reconciled.length === 0) {
    const id = crypto.randomUUID().slice(0, 8);
    const sessionName = `knife-${id}`;
    createSession(sessionName);
    reconciled.push({
      id,
      name: "Shell 1",
      sessionName,
      order: 0,
      createdAt: Date.now(),
    });
  }

  // Ensure orders are sequential 0..N
  reconciled.sort((a, b) => a.order - b.order);
  reconciled.forEach((t, i) => (t.order = i));

  return reconciled;
}

export function getTabCwd(sessionName: string): string | null {
  if (!hasSession(sessionName)) return null;
  const proc = Bun.spawnSync([
    "tmux",
    "-L",
    TMUX_SOCKET,
    "display-message",
    "-p",
    "-t",
    sessionName,
    "-F",
    "#{pane_current_path}",
  ]);
  if (proc.exitCode !== 0) return null;
  const cwd = proc.stdout.toString().trim();
  return cwd || null;
}
