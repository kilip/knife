import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { defaultRunner } from "../runner";
import { renderWindowsRunnerScript } from "../templates";
import type {
  CommandRunner,
  ResolvedServiceContext,
  ServiceCliOptions,
  ServiceInstallResult,
  ServiceManager,
  ServiceStatusResult,
} from "../types";

export class WindowsServiceManager implements ServiceManager {
  readonly platform = "win32";
  readonly displayName = "Windows Service / Task Scheduler";
  private runner: CommandRunner;

  constructor(runner: CommandRunner = defaultRunner) {
    this.runner = runner;
  }

  getUnitPath(name: string, system: boolean): string {
    if (system) {
      const programData = process.env.ProgramData || "C:\\ProgramData";
      return join(programData, "knife", `${name}-runner.cmd`);
    }
    const home = process.env.USERPROFILE || os.homedir();
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return join(localAppData, "knife", `${name}-runner.cmd`);
  }

  private getTaskName(name: string): string {
    return `Knife-${name}`;
  }

  async install(ctx: ResolvedServiceContext): Promise<ServiceInstallResult> {
    const scriptPath = this.getUnitPath(ctx.name, ctx.system);
    const scriptDir = dirname(scriptPath);
    if (!existsSync(scriptDir)) {
      mkdirSync(scriptDir, { recursive: true });
    }
    if (!existsSync(ctx.logDir)) {
      mkdirSync(ctx.logDir, { recursive: true });
    }

    const scriptContent = renderWindowsRunnerScript(ctx);
    writeFileSync(scriptPath, scriptContent, "utf-8");

    const warnings: string[] = [];
    const taskName = this.getTaskName(ctx.name);

    if (ctx.system) {
      // System service via sc.exe
      const scRes = this.runner.run("sc.exe", [
        "create",
        ctx.name,
        `binPath= "${scriptPath}"`,
        "start= auto",
      ]);
      if (scRes.exitCode !== 0) {
        warnings.push(`sc create warning: ${scRes.stderr || scRes.stdout}`);
      }
    } else {
      // User service via schtasks.exe (runs on logon without elevation)
      const schtasksRes = this.runner.run("schtasks.exe", [
        "/Create",
        "/TN",
        taskName,
        "/TR",
        `"${scriptPath}"`,
        "/SC",
        "ONLOGON",
        "/F",
      ]);
      if (schtasksRes.exitCode !== 0) {
        warnings.push(`schtasks create warning: ${schtasksRes.stderr || schtasksRes.stdout}`);
      }
    }

    return {
      unitPath: scriptPath,
      warnings,
    };
  }

  async uninstall(options: ServiceCliOptions): Promise<{ removedPath?: string }> {
    const scriptPath = this.getUnitPath(options.name, options.system);
    const taskName = this.getTaskName(options.name);

    if (options.system) {
      this.runner.run("sc.exe", ["stop", options.name]);
      this.runner.run("sc.exe", ["delete", options.name]);
    } else {
      this.runner.run("schtasks.exe", ["/End", "/TN", taskName]);
      this.runner.run("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]);
    }

    let removedPath: string | undefined;
    if (existsSync(scriptPath)) {
      rmSync(scriptPath);
      removedPath = scriptPath;
    }

    return { removedPath };
  }

  async start(options: ServiceCliOptions): Promise<void> {
    if (options.system) {
      const res = this.runner.run("sc.exe", ["start", options.name]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to start Windows service: ${res.stderr || res.stdout || "Unknown error"}`,
        );
      }
    } else {
      const taskName = this.getTaskName(options.name);
      const res = this.runner.run("schtasks.exe", ["/Run", "/TN", taskName]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to run scheduled task: ${res.stderr || res.stdout || "Unknown error"}`,
        );
      }
    }
  }

  async stop(options: ServiceCliOptions): Promise<void> {
    if (options.system) {
      const res = this.runner.run("sc.exe", ["stop", options.name]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to stop Windows service: ${res.stderr || res.stdout || "Unknown error"}`,
        );
      }
    } else {
      const taskName = this.getTaskName(options.name);
      const res = this.runner.run("schtasks.exe", ["/End", "/TN", taskName]);
      if (res.exitCode !== 0) {
        throw new Error(
          `Failed to end scheduled task: ${res.stderr || res.stdout || "Unknown error"}`,
        );
      }
    }
  }

  async restart(options: ServiceCliOptions): Promise<void> {
    await this.stop(options).catch(() => {});
    await this.start(options);
  }

  async status(options: ServiceCliOptions): Promise<ServiceStatusResult> {
    const scriptPath = this.getUnitPath(options.name, options.system);
    const installed = existsSync(scriptPath);

    if (!installed) {
      return {
        installed: false,
        active: false,
        status: "not-installed",
        unitPath: scriptPath,
        recentLogs: [],
      };
    }

    let active = false;
    let status: ServiceStatusResult["status"] = "stopped";
    let rawOutput = "";

    if (options.system) {
      const queryRes = this.runner.run("sc.exe", ["query", options.name]);
      rawOutput = queryRes.stdout;
      if (rawOutput.includes("RUNNING")) {
        active = true;
        status = "running";
      }
    } else {
      const taskName = this.getTaskName(options.name);
      const queryRes = this.runner.run("schtasks.exe", [
        "/Query",
        "/TN",
        taskName,
        "/FO",
        "LIST",
        "/V",
      ]);
      rawOutput = queryRes.stdout;
      if (rawOutput.includes("Running")) {
        active = true;
        status = "running";
      }
    }

    const home = process.env.USERPROFILE || os.homedir();
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    const logDir = join(localAppData, "knife", "logs");
    const stdoutLog = join(logDir, "stdout.log");
    const stderrLog = join(logDir, "stderr.log");
    const recentLogs: string[] = [];

    for (const logPath of [stdoutLog, stderrLog]) {
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
      unitPath: scriptPath,
      listenUrl,
      setupUrl,
      recentLogs: recentLogs.slice(-15),
      rawOutput,
    };
  }
}
