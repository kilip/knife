import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { defaultRunner } from "../runner";
import { renderLaunchdPlist } from "../templates";
import type {
  CommandRunner,
  ResolvedServiceContext,
  ServiceCliOptions,
  ServiceInstallResult,
  ServiceManager,
  ServiceStatusResult,
} from "../types";

export class LaunchdServiceManager implements ServiceManager {
  readonly platform = "darwin";
  readonly displayName = "macOS launchd";
  private runner: CommandRunner;

  constructor(runner: CommandRunner = defaultRunner) {
    this.runner = runner;
  }

  getUnitPath(name: string, system: boolean): string {
    const label = `com.kilip.${name}`;
    if (system) {
      return `/Library/LaunchDaemons/${label}.plist`;
    }
    const home = process.env.HOME || os.homedir();
    return join(home, "Library", "LaunchAgents", `${label}.plist`);
  }

  private getUid(): string {
    try {
      return String(os.userInfo()?.uid || 501);
    } catch {
      return "501";
    }
  }

  async install(ctx: ResolvedServiceContext): Promise<ServiceInstallResult> {
    const unitPath = this.getUnitPath(ctx.name, ctx.system);
    const unitDir = dirname(unitPath);
    if (!existsSync(unitDir)) {
      mkdirSync(unitDir, { recursive: true });
    }
    if (!existsSync(ctx.logDir)) {
      mkdirSync(ctx.logDir, { recursive: true });
    }

    const plistContent = renderLaunchdPlist(ctx);
    writeFileSync(unitPath, plistContent, "utf-8");

    const warnings: string[] = [];

    // Best-effort unload previous service if registered
    this.runner.run("launchctl", ["unload", "-w", unitPath]);

    // Load and enable service
    const loadRes = this.runner.run("launchctl", ["load", "-w", unitPath]);
    if (loadRes.exitCode !== 0) {
      warnings.push(`launchctl load warning: ${loadRes.stderr || loadRes.stdout}`);
    }

    return {
      unitPath,
      warnings,
    };
  }

  async uninstall(options: ServiceCliOptions): Promise<{ removedPath?: string }> {
    const unitPath = this.getUnitPath(options.name, options.system);
    this.runner.run("launchctl", ["unload", "-w", unitPath]);

    let removedPath: string | undefined;
    if (existsSync(unitPath)) {
      rmSync(unitPath);
      removedPath = unitPath;
    }

    return { removedPath };
  }

  async start(options: ServiceCliOptions): Promise<void> {
    const label = `com.kilip.${options.name}`;
    const uid = this.getUid();

    // Try kickstart first (modern macOS), fall back to launchctl start
    const kickstartRes = this.runner.run("launchctl", ["kickstart", "-k", `gui/${uid}/${label}`]);
    if (kickstartRes.exitCode !== 0) {
      const startRes = this.runner.run("launchctl", ["start", label]);
      if (startRes.exitCode !== 0) {
        throw new Error(
          `Failed to start launchd service: ${
            startRes.stderr || startRes.stdout || kickstartRes.stderr
          }`,
        );
      }
    }
  }

  async stop(options: ServiceCliOptions): Promise<void> {
    const label = `com.kilip.${options.name}`;
    const res = this.runner.run("launchctl", ["stop", label]);
    if (res.exitCode !== 0) {
      throw new Error(
        `Failed to stop launchd service: ${res.stderr || res.stdout || "Unknown error"}`,
      );
    }
  }

  async restart(options: ServiceCliOptions): Promise<void> {
    await this.stop(options).catch(() => {});
    await this.start(options);
  }

  async status(options: ServiceCliOptions): Promise<ServiceStatusResult> {
    const unitPath = this.getUnitPath(options.name, options.system);
    const label = `com.kilip.${options.name}`;
    const installed = existsSync(unitPath);

    if (!installed) {
      return {
        installed: false,
        active: false,
        status: "not-installed",
        unitPath,
        recentLogs: [],
      };
    }

    const listRes = this.runner.run("launchctl", ["list", label]);
    let active = false;
    let status: ServiceStatusResult["status"] = "stopped";
    let pid: number | undefined;

    if (listRes.exitCode === 0 && listRes.stdout) {
      // launchctl list output format: either JSON-like or tab-separated PID Status Label
      for (const line of listRes.stdout.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith('"PID"') || trimmed.startsWith("PID")) {
          const match = trimmed.match(/\b(\d+)\b/);
          if (match) {
            pid = parseInt(match[1], 10);
          }
        }
      }
      if (pid && pid > 0) {
        active = true;
        status = "running";
      }
    }

    // Read recent log lines from log files
    const home = process.env.HOME || os.homedir();
    const logDir = join(home, "Library", "Logs", options.name);
    const stdoutLogPath = join(logDir, "stdout.log");
    const stderrLogPath = join(logDir, "stderr.log");
    const recentLogs: string[] = [];

    for (const logPath of [stdoutLogPath, stderrLogPath]) {
      if (existsSync(logPath)) {
        try {
          const content = readFileSync(logPath, "utf-8");
          const lines = content.split(/\r?\n/).filter(Boolean);
          recentLogs.push(...lines.slice(-10));
        } catch {}
      }
    }

    let setupUrl: string | undefined;
    let listenUrl: string | undefined;
    for (const logLine of recentLogs) {
      const setupMatch = logLine.match(/http:\/\/[^\s]+\/setup\?token=[a-zA-Z0-9_-]+/);
      if (setupMatch) setupUrl = setupMatch[0];
      const listenMatch = logLine.match(/Listening on:\s+(http:\/\/[^\s]+)/);
      if (listenMatch) listenUrl = listenMatch[1];
    }

    return {
      installed: true,
      active,
      status,
      pid,
      unitPath,
      listenUrl,
      setupUrl,
      recentLogs: recentLogs.slice(-15),
      rawOutput: listRes.stdout,
    };
  }
}
