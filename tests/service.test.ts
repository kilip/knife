import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildResolvedServiceContext,
  buildServicePath,
  discoverExistingConfig,
  escapeSystemdArg,
  escapeXml,
  formatStatusOutput,
  getPlatformPaths,
  getServiceManager,
  handleServiceCommand,
  LaunchdServiceManager,
  parseServiceCliArgs,
  renderLaunchdPlist,
  renderSystemdUnit,
  renderWindowsRunnerScript,
  resolveBunExecutable,
  SystemdServiceManager,
  WindowsServiceManager,
  type CommandResult,
  type CommandRunner,
} from "../server/service";

class MockCommandRunner implements CommandRunner {
  public calls: Array<{ cmd: string; args: string[] }> = [];
  public responses: Map<string, CommandResult> = new Map();

  run(cmd: string, args: string[]): CommandResult {
    this.calls.push({ cmd, args });
    const key = `${cmd} ${args.join(" ")}`;
    for (const [pattern, res] of this.responses.entries()) {
      if (key.includes(pattern)) {
        return res;
      }
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }
}

const tmpDir = join(process.cwd(), "tmp_test_service_" + Date.now());

beforeAll(() => {
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
});

afterAll(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("Service CLI Argument Parsing", () => {
  it("ignores non-service commands", () => {
    expect(parseServiceCliArgs([])).toBeNull();
    expect(parseServiceCliArgs(["--port", "3000"])).toBeNull();
    expect(parseServiceCliArgs(["--help"])).toBeNull();
  });

  it("parses space-separated service commands", () => {
    const opts = parseServiceCliArgs(["service", "install", "--port", "8080", "--system"]);
    expect(opts).not.toBeNull();
    expect(opts?.action).toBe("install");
    expect(opts?.port).toBe(8080);
    expect(opts?.system).toBe(true);
    expect(opts?.name).toBe("knife");
  });

  it("parses colon-separated service commands", () => {
    const opts = parseServiceCliArgs([
      "service:status",
      "--name",
      "custom-knife",
      "--host=0.0.0.0",
      "-d",
      "example.com",
    ]);
    expect(opts).not.toBeNull();
    expect(opts?.action).toBe("status");
    expect(opts?.name).toBe("custom-knife");
    expect(opts?.host).toBe("0.0.0.0");
    expect(opts?.domain).toBe("example.com");
  });

  it("parses service restart, stop, and uninstall commands", () => {
    expect(parseServiceCliArgs(["service:restart"])?.action).toBe("restart");
    expect(parseServiceCliArgs(["service", "stop"])?.action).toBe("stop");
    expect(parseServiceCliArgs(["service:uninstall"])?.action).toBe("uninstall");
  });

  it("handles repeated --env flags", () => {
    const opts = parseServiceCliArgs(["service:install", "--env", "FOO=bar", "--env=BAZ=123"]);
    expect(opts?.env).toEqual({ FOO: "bar", BAZ: "123" });
  });

  it("handles help flags", () => {
    const opts1 = parseServiceCliArgs(["service", "--help"]);
    expect(opts1?.help).toBe(true);

    const opts2 = parseServiceCliArgs(["service:install", "-h"]);
    expect(opts2?.help).toBe(true);
  });
});

describe("Path & Environment Utilities", () => {
  it("resolves platform paths for Linux, Darwin, and Windows", () => {
    const linux = getPlatformPaths("knife", "linux", { HOME: "/home/test" });
    expect(linux.userConfigDir).toBe("/home/test/.config/knife");
    expect(linux.userDataDir).toBe("/home/test/.local/share/knife/data");

    const darwin = getPlatformPaths("knife", "darwin", { HOME: "/Users/test" });
    expect(darwin.userConfigDir).toBe("/Users/test/Library/Application Support/knife");
    expect(darwin.userLogDir).toBe("/Users/test/Library/Logs/knife");

    const win = getPlatformPaths("knife", "win32", {
      USERPROFILE: "C:\\Users\\test",
      APPDATA: "C:\\Users\\test\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local",
    });
    expect(win.userConfigDir).toBe("C:\\Users\\test\\AppData\\Roaming\\knife");
    expect(win.userLogDir).toBe("C:\\Users\\test\\AppData\\Local\\knife\\logs");
  });

  it("constructs service PATH including bun directory", () => {
    const bunPath = "/opt/bun/bin/bun";
    const built = buildServicePath(bunPath, "linux", "/usr/bin:/bin");
    expect(built).toContain("/opt/bun/bin");
    expect(built).toContain("/usr/bin");
    expect(built).toContain("/bin");
  });

  it("resolves Bun executable", () => {
    const runner = new MockCommandRunner();
    runner.responses.set("which bun", {
      exitCode: 0,
      stdout: process.execPath,
      stderr: "",
    });
    const resolved = resolveBunExecutable(runner, "linux");
    expect(resolved).toBeTruthy();
    expect(existsSync(resolved)).toBe(true);
  });
});

describe("Existing Config Discovery & Reuse", () => {
  it("discovers and extracts existing configuration", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        host: "192.168.1.50",
        port: 4567,
        publicDomain: "terminal.internal",
        publicScheme: "https",
      }),
      "utf-8",
    );

    const discovered = discoverExistingConfig({ configPath }, tmpDir, "linux");
    expect(discovered.exists).toBe(true);
    expect(discovered.host).toBe("192.168.1.50");
    expect(discovered.port).toBe(4567);
    expect(discovered.publicDomain).toBe("terminal.internal");
    expect(discovered.workingDir).toBe(tmpDir);
  });

  it("builds resolved service context reusing existing config defaults", () => {
    const configPath = join(tmpDir, "config.json");
    const ctx = buildResolvedServiceContext(
      {
        action: "install",
        name: "test-knife",
        system: false,
        configPath,
        env: { CUSTOM_VAR: "true" },
      },
      tmpDir,
    );

    expect(ctx.name).toBe("test-knife");
    expect(ctx.configPath).toBe(configPath);
    expect(ctx.configExists).toBe(true);
    expect(ctx.cliArgs).toContain("--port");
    expect(ctx.cliArgs).toContain("4567");
    expect(ctx.cliArgs).toContain("--host");
    expect(ctx.cliArgs).toContain("192.168.1.50");
    expect(ctx.env.KNIFE_CONFIG_PATH).toBe(configPath);
    expect(ctx.env.CUSTOM_VAR).toBe("true");
  });
});

describe("Template Generators", () => {
  const dummyCtx = {
    name: "knife",
    system: false,
    bunPath: "/home/user/.bun/bin/bun",
    entrypointPath: "/home/user/code/knife/server/index.ts",
    workingDir: "/home/user/code/knife",
    configPath: "/home/user/code/knife/config.json",
    configExists: true,
    dataDir: "/home/user/code/knife/data",
    logDir: "/home/user/.local/state/knife/logs",
    cliArgs: ["--config", "/home/user/code/knife/config.json", "--port", "3000"],
    env: {
      PATH: "/home/user/.bun/bin:/usr/bin",
      NODE_ENV: "production",
      KNIFE_CONFIG_PATH: "/home/user/code/knife/config.json",
    },
    discoveredConfig: {
      configPath: "/home/user/code/knife/config.json",
      exists: true,
      workingDir: "/home/user/code/knife",
      dataDir: "/home/user/code/knife/data",
    },
  };

  it("escapes systemd arguments with spaces and quotes", () => {
    expect(escapeSystemdArg("simple")).toBe("simple");
    expect(escapeSystemdArg("/path with spaces/bin")).toBe('"/path with spaces/bin"');
    expect(escapeSystemdArg('arg"with"quote')).toBe('"arg\\"with\\"quote"');
  });

  it("renders a valid systemd unit file", () => {
    const unit = renderSystemdUnit(dummyCtx);
    expect(unit).toContain("[Unit]");
    expect(unit).toContain("Description=Knife - Web Terminal & File Browser (knife)");
    expect(unit).toContain("ExecStart=");
    expect(unit).toContain("/home/user/.bun/bin/bun run /home/user/code/knife/server/index.ts");
    expect(unit).toContain('Environment="KNIFE_CONFIG_PATH=/home/user/code/knife/config.json"');
    expect(unit).toContain("WantedBy=default.target");
  });

  it("renders systemd unit for system-wide service", () => {
    const unit = renderSystemdUnit({ ...dummyCtx, system: true });
    expect(unit).toContain("WantedBy=multi-user.target");
  });

  it("escapes XML entities in launchd plist", () => {
    expect(escapeXml("<test>&\"'</test>")).toBe("&lt;test&gt;&amp;&quot;&apos;&lt;/test&gt;");
  });

  it("renders valid macOS launchd property list", () => {
    const plist = renderLaunchdPlist(dummyCtx);
    expect(plist).toContain("<key>Label</key>");
    expect(plist).toContain("<string>com.kilip.knife</string>");
    expect(plist).toContain("<key>ProgramArguments</key>");
    expect(plist).toContain("<string>/home/user/.bun/bin/bun</string>");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<true/>");
  });

  it("renders Windows runner batch script", () => {
    const script = renderWindowsRunnerScript(dummyCtx);
    expect(script).toContain("@echo off");
    expect(script).toContain('@set "NODE_ENV=production"');
    expect(script).toContain('cd /d "/home/user/code/knife"');
    expect(script).toContain('"/home/user/.bun/bin/bun" run');
  });
});

describe("Platform Factory & Managers", () => {
  it("resolves correct driver from factory", () => {
    expect(getServiceManager("linux")).toBeInstanceOf(SystemdServiceManager);
    expect(getServiceManager("darwin")).toBeInstanceOf(LaunchdServiceManager);
    expect(getServiceManager("win32")).toBeInstanceOf(WindowsServiceManager);
    expect(() => getServiceManager("aix" as any)).toThrow("Unsupported platform");
  });

  it("executes SystemdServiceManager lifecycle commands using mock runner", async () => {
    const runner = new MockCommandRunner();
    runner.responses.set("is-active", { exitCode: 0, stdout: "active", stderr: "" });
    runner.responses.set("show", {
      exitCode: 0,
      stdout: "ActiveState=active\nMainPID=12345\nExecMainStartTimestamp=Wed 2026-11-11 12:00:00",
      stderr: "",
    });
    runner.responses.set("journalctl", {
      exitCode: 0,
      stdout: "Listening on: http://127.0.0.1:3000\n",
      stderr: "",
    });

    const manager = new SystemdServiceManager(runner);
    const unitPath = manager.getUnitPath("test-service", false);
    expect(unitPath).toContain(".config/systemd/user/test-service.service");

    // Expect start to throw if unit file does not exist
    expect(
      manager.start({ action: "start", name: "test-service", system: false, env: {} }),
    ).rejects.toThrow("Service unit not found");

    // Create unit file and verify start succeeds
    const unitDir = join(tmpDir, ".config", "systemd", "user");
    mkdirSync(unitDir, { recursive: true });
    const testUnit = join(unitDir, "test-service.service");
    writeFileSync(testUnit, "# test unit", "utf-8");

    // Temporarily point HOME to tmpDir to test start with existing unit
    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;
    try {
      await manager.start({ action: "start", name: "test-service", system: false, env: {} });
      expect(runner.calls.some((c) => c.cmd === "systemctl" && c.args.includes("start"))).toBe(
        true,
      );
    } finally {
      process.env.HOME = origHome;
    }
    await manager.stop({ action: "stop", name: "test-service", system: false, env: {} });
    expect(runner.calls.some((c) => c.cmd === "systemctl" && c.args.includes("stop"))).toBe(true);

    await manager.restart({ action: "restart", name: "test-service", system: false, env: {} });
    expect(runner.calls.some((c) => c.cmd === "systemctl" && c.args.includes("restart"))).toBe(
      true,
    );
  });

  it("executes LaunchdServiceManager lifecycle commands using mock runner", async () => {
    const runner = new MockCommandRunner();
    runner.responses.set("launchctl list", {
      exitCode: 0,
      stdout: '{\n\t"PID" = 54321;\n\t"LastExitStatus" = 0;\n}',
      stderr: "",
    });

    const manager = new LaunchdServiceManager(runner);
    const unitPath = manager.getUnitPath("test-service", false);
    expect(unitPath).toContain("Library/LaunchAgents/com.kilip.test-service.plist");

    await manager.start({ action: "start", name: "test-service", system: false, env: {} });
    expect(runner.calls.some((c) => c.cmd === "launchctl" && c.args.includes("kickstart"))).toBe(
      true,
    );

    await manager.stop({ action: "stop", name: "test-service", system: false, env: {} });
    expect(runner.calls.some((c) => c.cmd === "launchctl" && c.args.includes("stop"))).toBe(true);
  });

  it("executes WindowsServiceManager lifecycle commands using mock runner", async () => {
    const runner = new MockCommandRunner();
    runner.responses.set("schtasks.exe /Query", {
      exitCode: 0,
      stdout: "Status: Running\nTaskName: \\Knife-test-service",
      stderr: "",
    });

    const manager = new WindowsServiceManager(runner);
    await manager.start({ action: "start", name: "test-service", system: false, env: {} });
    expect(runner.calls.some((c) => c.cmd === "schtasks.exe" && c.args.includes("/Run"))).toBe(
      true,
    );

    await manager.stop({ action: "stop", name: "test-service", system: false, env: {} });
    expect(runner.calls.some((c) => c.cmd === "schtasks.exe" && c.args.includes("/End"))).toBe(
      true,
    );
  });
});

describe("Format Status Output", () => {
  it("formats running status with PID and setup token", () => {
    const formatted = formatStatusOutput({
      installed: true,
      active: true,
      status: "running",
      pid: 9999,
      unitPath: "/tmp/knife.service",
      listenUrl: "http://127.0.0.1:3000",
      setupUrl: "http://127.0.0.1:3000/setup?token=secret123",
      recentLogs: ["Server started", "Listening on http://127.0.0.1:3000"],
    });

    expect(formatted).toContain("Knife Service");
    expect(formatted).toContain("active (running)");
    expect(formatted).toContain("PID:           9999");
    expect(formatted).toContain("http://127.0.0.1:3000/setup?token=secret123");
    expect(formatted).toContain("Server started");
  });

  it("formats stopped and not-installed status", () => {
    const stopped = formatStatusOutput({
      installed: true,
      active: false,
      status: "stopped",
      unitPath: "/tmp/knife.service",
      recentLogs: [],
    });
    expect(stopped).toContain("inactive (stopped)");

    const notInstalled = formatStatusOutput({
      installed: false,
      active: false,
      status: "not-installed",
      unitPath: "/tmp/knife.service",
      recentLogs: [],
    });
    expect(notInstalled).toContain("not installed");
  });
});

describe("handleServiceCommand Dispatcher", () => {
  it("returns false for non-service arguments", async () => {
    const handled = await handleServiceCommand(["--port", "8080"]);
    expect(handled).toBe(false);
  });

  it("handles service --help without throwing", async () => {
    const handled = await handleServiceCommand(["service", "--help"]);
    expect(handled).toBe(true);
  });
});
