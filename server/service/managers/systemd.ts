import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { defaultRunner } from "../runner";
import { renderSystemdUnit } from "../templates";
import type {
  CommandRunner,
  ResolvedServiceContext,
  ServiceCliOptions,
  ServiceInstallResult,
  ServiceManager,
  ServiceStatusResult,
} from "../types";

export class SystemdServiceManager implements ServiceManager {
  readonly platform = "linux";
  readonly displayName = "Linux systemd";
  private runner: CommandRunner;

  constructor(runner: CommandRunner = defaultRunner) {
    this.runner = runner;
  }

  getUnitPath(name: string, system: boolean): string {
    if (system) {
      return `/etc/systemd/system/${name}.service`;
    }
    const home = process.env.HOME || os.homedir();
    return join(home, ".config", "systemd", "user", `${name}.service`);
  }

  private getSystemctlArgs(system: boolean, action: string, ...extra: string[]): string[] {
    const args = system ? [] : ["--user"];
    args.push(action, ...extra);
    return args;
  }

  async install(ctx: ResolvedServiceContext): Promise<ServiceInstallResult> {
    const unitPath = this.getUnitPath(ctx.name, ctx.system);
    const unitDir = dirname(unitPath);
    if (!existsSync(unitDir)) {
      mkdirSync(unitDir, { recursive: true });
    }

    const unitContent = renderSystemdUnit(ctx);
    writeFileSync(unitPath, unitContent, "utf-8");

    const warnings: string[] = [];

    // 1. Reload systemd daemon
    const reloadRes = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(ctx.system, "daemon-reload"),
    );
    if (reloadRes.exitCode !== 0) {
      warnings.push(`daemon-reload failed: ${reloadRes.stderr || reloadRes.stdout}`);
    }

    // 2. Enable service
    const enableRes = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(ctx.system, "enable", `${ctx.name}.service`),
    );
    if (enableRes.exitCode !== 0) {
      warnings.push(`enable service failed: ${enableRes.stderr || enableRes.stdout}`);
    }

    // 3. User lingering check (only for user services on Linux)
    let lingerEnabled: boolean | undefined;
    if (!ctx.system) {
      const username = process.env.USER || os.userInfo()?.username;
      if (username) {
        const lingerCheck = this.runner.run("loginctl", [
          "show-user",
          username,
          "--property=Linger",
        ]);
        if (lingerCheck.exitCode === 0 && lingerCheck.stdout.toLowerCase().includes("linger=no")) {
          const enableLingerRes = this.runner.run("loginctl", ["enable-linger", username]);
          if (enableLingerRes.exitCode === 0) {
            lingerEnabled = true;
          } else {
            warnings.push(
              `Could not enable user lingering automatically. Run 'loginctl enable-linger ${username}' to keep Knife running across logouts.`,
            );
          }
        } else if (lingerCheck.stdout.toLowerCase().includes("linger=yes")) {
          lingerEnabled = true;
        }
      }
    }

    return {
      unitPath,
      warnings,
      lingerEnabled,
    };
  }

  async uninstall(options: ServiceCliOptions): Promise<{ removedPath?: string }> {
    const unitPath = this.getUnitPath(options.name, options.system);

    // Stop and disable service
    this.runner.run(
      "systemctl",
      this.getSystemctlArgs(options.system, "stop", `${options.name}.service`),
    );
    this.runner.run(
      "systemctl",
      this.getSystemctlArgs(options.system, "disable", `${options.name}.service`),
    );

    let removedPath: string | undefined;
    if (existsSync(unitPath)) {
      rmSync(unitPath);
      removedPath = unitPath;
    }

    this.runner.run("systemctl", this.getSystemctlArgs(options.system, "daemon-reload"));
    return { removedPath };
  }

  async start(options: ServiceCliOptions): Promise<void> {
    const unitPath = this.getUnitPath(options.name, options.system);
    if (!existsSync(unitPath)) {
      throw new Error(
        `Service unit not found at ${unitPath}. Please run 'knife service install' first.`,
      );
    }

    const res = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(options.system, "start", `${options.name}.service`),
    );
    if (res.exitCode !== 0) {
      throw new Error(`Failed to start service: ${res.stderr || res.stdout || "Unknown error"}`);
    }
  }

  async stop(options: ServiceCliOptions): Promise<void> {
    const res = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(options.system, "stop", `${options.name}.service`),
    );
    if (res.exitCode !== 0) {
      throw new Error(`Failed to stop service: ${res.stderr || res.stdout || "Unknown error"}`);
    }
  }

  async restart(options: ServiceCliOptions): Promise<void> {
    const res = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(options.system, "restart", `${options.name}.service`),
    );
    if (res.exitCode !== 0) {
      throw new Error(`Failed to restart service: ${res.stderr || res.stdout || "Unknown error"}`);
    }
  }

  async status(options: ServiceCliOptions): Promise<ServiceStatusResult> {
    const unitPath = this.getUnitPath(options.name, options.system);
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

    // Check is-active
    const isActiveRes = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(options.system, "is-active", `${options.name}.service`),
    );
    const activeText = isActiveRes.stdout.trim().toLowerCase();
    const active = activeText === "active";

    let status: ServiceStatusResult["status"] = "unknown";
    if (activeText === "active") status = "running";
    else if (activeText === "inactive") status = "stopped";
    else if (activeText === "failed") status = "failed";
    else status = activeText as any;

    // Show properties
    const showRes = this.runner.run(
      "systemctl",
      this.getSystemctlArgs(
        options.system,
        "show",
        `${options.name}.service`,
        "--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp",
      ),
    );

    let pid: number | undefined;
    let uptime: string | undefined;

    if (showRes.exitCode === 0) {
      for (const line of showRes.stdout.split("\n")) {
        const [k, v] = line.split("=");
        if (k === "MainPID" && v && v !== "0") {
          const parsed = parseInt(v, 10);
          if (!isNaN(parsed) && parsed > 0) pid = parsed;
        } else if (k === "ExecMainStartTimestamp" && v && v !== "0") {
          uptime = v.trim();
        }
      }
    }

    // Recent journalctl logs
    const journalArgs = options.system
      ? ["-u", `${options.name}.service`, "-n", "15", "--no-pager"]
      : ["--user", "-u", `${options.name}.service`, "-n", "15", "--no-pager"];
    const journalRes = this.runner.run("journalctl", journalArgs);
    const recentLogs = journalRes.stdout
      ? journalRes.stdout.split("\n").filter((l) => l.trim().length > 0)
      : [];

    // Extract setup token if Knife is in first-run setup mode
    let setupUrl: string | undefined;
    let listenUrl: string | undefined;
    for (const logLine of recentLogs) {
      const setupMatch = logLine.match(/http:\/\/[^\s]+\/setup\?token=[a-zA-Z0-9_-]+/);
      if (setupMatch) {
        setupUrl = setupMatch[0];
      }
      const listenMatch = logLine.match(/Listening on:\s+(http:\/\/[^\s]+)/);
      if (listenMatch) {
        listenUrl = listenMatch[1];
      }
    }

    return {
      installed: true,
      active,
      status,
      pid,
      uptime,
      unitPath,
      listenUrl,
      setupUrl,
      recentLogs,
      rawOutput: showRes.stdout,
    };
  }
}
