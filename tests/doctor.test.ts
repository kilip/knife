import { describe, expect, it } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDoctorCommand, parseDoctorCliArgs } from "../server/features/doctor/cli";
import {
  type DoctorDeps,
  type DoctorOptions,
  extractServiceUnitPaths,
  formatDoctorReport,
  runDoctorChecks,
} from "../server/features/doctor/doctor";
import type { FetchLike } from "../server/features/update/update";
import type { CommandResult, CommandRunner } from "../server/service/types";

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

interface DoctorFixture {
  root: string;
  pkgRoot: string;
  configPath: string;
  dataDir: string;
  shellPath: string;
  bunPath: string;
  deps: DoctorDeps;
  options: DoctorOptions;
}

function createHealthyFixture(): DoctorFixture {
  const root = mkdtempSync(join(tmpdir(), "knife-doctor-test-"));
  const pkgRoot = join(root, "pkg");
  const buildClientDir = join(pkgRoot, "build", "client");
  const serverDir = join(pkgRoot, "server");
  const dataDir = join(root, "data");
  const configPath = join(root, "config.json");
  const shellPath = join(root, "sh");
  const bunPath = join(root, "bun");

  mkdirSync(buildClientDir, { recursive: true });
  mkdirSync(serverDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  writeFileSync(join(pkgRoot, "package.json"), JSON.stringify({ version: "0.6.0-rc1" }));
  writeFileSync(join(serverDir, "index.ts"), "// entry");
  writeFileSync(join(buildClientDir, "index.html"), "<html></html>");
  writeFileSync(join(buildClientDir, "sw.js"), "// sw");
  writeFileSync(join(buildClientDir, "manifest.webmanifest"), "{}");
  writeFileSync(shellPath, "#!/bin/sh\n");
  chmodSync(shellPath, 0o755);
  writeFileSync(bunPath, "#!/bin/sh\n");
  chmodSync(bunPath, 0o755);

  writeFileSync(
    configPath,
    JSON.stringify({
      host: "127.0.0.1",
      port: 3000,
      publicDomain: "knife.example.com",
      publicScheme: "https",
      trustedProxies: ["127.0.0.1"],
      theme: "catppuccin-mocha",
      auth: {
        githubClientId: "gh-client-id-123",
        githubClientSecret: "SUPER_SECRET_OAUTH_VALUE_DO_NOT_LEAK",
        allowedUsername: "kilip",
        allowedUserId: 42,
      },
      sessionSecret: "SUPER_SECRET_SESSION_VALUE_DO_NOT_LEAK",
    }),
    { mode: 0o600 },
  );
  chmodSync(configPath, 0o600);

  writeFileSync(join(dataDir, "tabs.json"), JSON.stringify([{ id: "t1", name: "sh 1", order: 0 }]));
  writeFileSync(join(dataDir, "settings.json"), JSON.stringify({ theme: "catppuccin-mocha" }));

  const mockFetch: FetchLike = async (url) => {
    if (url.includes("/health")) {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }
    return new Response(JSON.stringify({ version: "0.6.0-rc1" }), { status: 200 });
  };

  const runner = new MockCommandRunner();

  return {
    root,
    pkgRoot,
    configPath,
    dataDir,
    shellPath,
    bunPath,
    deps: {
      platform: "linux",
      arch: "x64",
      isWslFn: () => false,
      bunVersion: "1.4.4",
      bunExecutable: bunPath,
      packageRoot: pkgRoot,
      cwd: root,
      env: {
        HOME: root,
        USER: "tester",
        KNIFE_CONFIG_PATH: configPath,
        KNIFE_DATA_DIR: dataDir,
      },
      runner,
      fetchFn: mockFetch,
      shellPath,
      testPty: () => ({ ok: true }),
      currentVersion: "0.6.0-rc1",
    },
    options: {
      configPath,
      serviceName: "knife-doctor-nonexistent",
      system: false,
      offline: false,
      json: false,
      help: false,
    },
  };
}

describe("Doctor CLI Argument Parsing", () => {
  it("returns null for non-doctor invocations", () => {
    expect(parseDoctorCliArgs([])).toBeNull();
    expect(parseDoctorCliArgs(["self-update"])).toBeNull();
    expect(parseDoctorCliArgs(["--port", "3000"])).toBeNull();
  });

  it("parses all supported options including inline syntax", () => {
    const parsed = parseDoctorCliArgs([
      "doctor",
      "--config=/tmp/knife.json",
      "--host",
      "127.0.0.1",
      "-p",
      "8080",
      "--name=custom-knife",
      "--system",
      "--offline",
      "--json",
    ]);
    expect(parsed).toEqual({
      configPath: "/tmp/knife.json",
      host: "127.0.0.1",
      port: 8080,
      serviceName: "custom-knife",
      system: true,
      offline: true,
      json: true,
      help: false,
    });
  });

  it("parses --port=, --host=, --user, and -h", () => {
    const parsed = parseDoctorCliArgs(["doctor", "--host=0.0.0.0", "--port=3001", "--user", "-h"]);
    expect(parsed).toEqual({
      host: "0.0.0.0",
      port: 3001,
      serviceName: "knife",
      system: false,
      offline: false,
      json: false,
      help: true,
    });
  });

  it("throws on missing option values, invalid host/port, and unknown options", () => {
    expect(() => parseDoctorCliArgs(["doctor", "--config"])).toThrow("Missing value");
    expect(() => parseDoctorCliArgs(["doctor", "--config", "--offline"])).toThrow("Missing value");
    expect(() => parseDoctorCliArgs(["doctor", "--config="])).toThrow("Missing value");
    expect(() => parseDoctorCliArgs(["doctor", "--port", "0"])).toThrow("Invalid port");
    expect(() => parseDoctorCliArgs(["doctor", "--port=70000"])).toThrow("Invalid port");
    expect(() => parseDoctorCliArgs(["doctor", "--port", "abc"])).toThrow("Invalid port");
    expect(() => parseDoctorCliArgs(["doctor", "--host", "bad_host"])).toThrow("Invalid host");
    expect(() => parseDoctorCliArgs(["doctor", "--unknown"])).toThrow("Unknown option");
  });
});

describe("Service Unit Path Extraction", () => {
  it("extracts paths from systemd ExecStart including quoted spaces", () => {
    const unit = `[Service]
WorkingDirectory=/tmp/work
ExecStart="/opt/my bun/bin/bun" run "/srv/my knife/server/index.ts" --config "/etc/knife/config.json"
`;
    expect(extractServiceUnitPaths(unit, "linux")).toEqual({
      bunPath: "/opt/my bun/bin/bun",
      entrypointPath: "/srv/my knife/server/index.ts",
    });
  });

  it("extracts paths from macOS launchd plist with XML entities", () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/bun</string>
    <string>run</string>
    <string>/Users/test/my&amp;app/server/index.ts</string>
  </array>
</dict>
</plist>`;
    expect(extractServiceUnitPaths(plist, "darwin")).toEqual({
      bunPath: "/opt/homebrew/bin/bun",
      entrypointPath: "/Users/test/my&app/server/index.ts",
    });
  });
});

describe("Doctor Diagnostic Checks", () => {
  it("reports healthy environment with exit code 0 and never leaks secrets", async () => {
    const fixture = createHealthyFixture();
    try {
      const logs: string[] = [];
      const exitCode = await handleDoctorCommand(
        ["doctor", "--config", fixture.configPath, "--name", "knife-doctor-nonexistent"],
        { ...fixture.deps, log: (line) => logs.push(line) },
      );

      expect(exitCode).toBe(0);
      const output = logs.join("\n");
      expect(output).toContain("Knife Doctor (v0.6.0-rc1)");
      expect(output).toContain("Summary:");
      expect(output).toContain("0 failed");
      expect(output).not.toContain("SUPER_SECRET_OAUTH_VALUE_DO_NOT_LEAK");
      expect(output).not.toContain("SUPER_SECRET_SESSION_VALUE_DO_NOT_LEAK");

      const report = await runDoctorChecks(fixture.options, fixture.deps);
      expect(report.ok).toBe(true);
      expect(report.summary.fail).toBe(0);
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain("SUPER_SECRET_OAUTH_VALUE_DO_NOT_LEAK");
      expect(serialized).not.toContain("SUPER_SECRET_SESSION_VALUE_DO_NOT_LEAK");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("warns when config.json is missing (first-run mode) without failing", async () => {
    const fixture = createHealthyFixture();
    try {
      rmSync(fixture.configPath);
      const report = await runDoctorChecks(fixture.options, fixture.deps);
      expect(report.ok).toBe(true);
      const cfg = report.checks.find((c) => c.id === "config");
      expect(cfg?.status).toBe("warn");
      expect(cfg?.message).toContain("first-run setup mode");
      expect(report.checks.find((c) => c.id === "config-permissions")).toBeUndefined();
      expect(report.checks.find((c) => c.id === "security")).toBeUndefined();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails on corrupt config.json", async () => {
    const fixture = createHealthyFixture();
    try {
      writeFileSync(fixture.configPath, "{ invalid json");
      const report = await runDoctorChecks(fixture.options, fixture.deps);
      expect(report.ok).toBe(false);
      const cfg = report.checks.find((c) => c.id === "config");
      expect(cfg?.status).toBe("fail");
      expect(cfg?.message).toContain("Invalid configuration");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("warns on permissive config.json file mode", async () => {
    const fixture = createHealthyFixture();
    try {
      chmodSync(fixture.configPath, 0o644);
      const report = await runDoctorChecks(fixture.options, fixture.deps);
      const perms = report.checks.find((c) => c.id === "config-permissions");
      expect(perms?.status).toBe("warn");
      expect(perms?.hint).toContain("chmod 600");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("flags security hygiene issues (non-HTTPS scheme, 0.0.0.0 bind, missing secret)", async () => {
    const fixture = createHealthyFixture();
    try {
      writeFileSync(
        fixture.configPath,
        JSON.stringify({
          host: "0.0.0.0",
          port: 3000,
          publicDomain: "knife.example.com",
          publicScheme: "http",
          auth: {
            githubClientId: "cid",
            githubClientSecret: "csec",
            allowedUsername: "kilip",
          },
          sessionSecret: "sec",
        }),
        { mode: 0o600 },
      );
      const warnReport = await runDoctorChecks(fixture.options, fixture.deps);
      const secWarn = warnReport.checks.find((c) => c.id === "security");
      expect(secWarn?.status).toBe("warn");
      expect(secWarn?.message).toContain("publicScheme is 'http'");
      expect(secWarn?.message).toContain("0.0.0.0");

      writeFileSync(
        fixture.configPath,
        JSON.stringify({
          host: "127.0.0.1",
          port: 3000,
          publicDomain: "knife.example.com",
          publicScheme: "https",
          auth: {
            githubClientId: "cid",
            githubClientSecret: "",
            allowedUsername: "kilip",
          },
          sessionSecret: "sec",
        }),
        { mode: 0o600 },
      );
      const failReport = await runDoctorChecks(fixture.options, fixture.deps);
      const secFail = failReport.checks.find((c) => c.id === "security");
      expect(secFail?.status).toBe("fail");
      expect(failReport.ok).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("checks build artifacts (missing index.html vs missing PWA assets)", async () => {
    const fixture = createHealthyFixture();
    try {
      rmSync(join(fixture.pkgRoot, "build", "client", "sw.js"));
      const warnReport = await runDoctorChecks(fixture.options, fixture.deps);
      const buildWarn = warnReport.checks.find((c) => c.id === "build");
      expect(buildWarn?.status).toBe("warn");
      expect(buildWarn?.message).toContain("sw.js");

      rmSync(join(fixture.pkgRoot, "build", "client", "index.html"));
      const failReport = await runDoctorChecks(fixture.options, fixture.deps);
      const buildFail = failReport.checks.find((c) => c.id === "build");
      expect(buildFail?.status).toBe("fail");
      expect(buildFail?.hint).toContain("self-update --force");

      mkdirSync(join(fixture.pkgRoot, ".git"));
      const gitFailReport = await runDoctorChecks(fixture.options, fixture.deps);
      expect(gitFailReport.checks.find((c) => c.id === "build")?.hint).toContain("bun run build");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("checks platform, Bun version, shell, and PTY engine", async () => {
    const fixture = createHealthyFixture();
    try {
      const wslReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        isWslFn: () => true,
      });
      expect(wslReport.checks.find((c) => c.id === "platform")?.message).toContain("[WSL]");

      const macReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        platform: "darwin",
      });
      expect(macReport.checks.find((c) => c.id === "platform")?.status).toBe("warn");

      const winReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        platform: "win32",
      });
      expect(winReport.checks.find((c) => c.id === "platform")?.status).toBe("fail");

      const oldBunReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        bunVersion: "1.1.9",
      });
      expect(oldBunReport.checks.find((c) => c.id === "bun")?.status).toBe("fail");

      const missingBunReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        bunVersion: null,
      });
      expect(missingBunReport.checks.find((c) => c.id === "bun")?.status).toBe("fail");

      chmodSync(fixture.shellPath, 0o644);
      const badShellReport = await runDoctorChecks(fixture.options, fixture.deps);
      expect(badShellReport.checks.find((c) => c.id === "shell")?.status).toBe("fail");

      const missingShellReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        shellPath: join(fixture.root, "missing-shell"),
      });
      expect(missingShellReport.checks.find((c) => c.id === "shell")?.status).toBe("fail");

      const badPtyReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        testPty: () => ({ ok: false, error: "ENXIO no ptmx" }),
      });
      expect(badPtyReport.checks.find((c) => c.id === "pty")?.status).toBe("fail");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("inspects corrupt tabs.json and settings.json strictly read-only without renaming files", async () => {
    const fixture = createHealthyFixture();
    try {
      const tabsPath = join(fixture.dataDir, "tabs.json");
      const settingsPath = join(fixture.dataDir, "settings.json");
      writeFileSync(tabsPath, "{not-json");
      writeFileSync(settingsPath, "[1, 2, 3]");

      const report = await runDoctorChecks(fixture.options, fixture.deps);
      const dataCheck = report.checks.find((c) => c.id === "data-dir");
      expect(dataCheck?.status).toBe("warn");
      expect(dataCheck?.message).toContain("tabs.json");
      expect(dataCheck?.message).toContain("settings.json");

      // Must NOT quarantine or alter files
      expect(existsSync(tabsPath)).toBe(true);
      expect(readFileSync(tabsPath, "utf-8")).toBe("{not-json");
      expect(readFileSync(settingsPath, "utf-8")).toBe("[1, 2, 3]");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("evaluates service states, unit paths, Linux linger, and active-service health failures", async () => {
    const fixture = createHealthyFixture();
    const serviceName = "knife-doctor-unit-test";
    const unitDir = join(fixture.root, ".config", "systemd", "user");
    mkdirSync(unitDir, { recursive: true });
    const unitPath = join(unitDir, `${serviceName}.service`);
    const entrypointPath = join(fixture.pkgRoot, "server", "index.ts");

    writeFileSync(
      unitPath,
      `[Service]\nExecStart=${fixture.bunPath} run ${entrypointPath} --config ${fixture.configPath}\n`,
    );

    const origHome = process.env.HOME;
    process.env.HOME = fixture.root;
    try {
      // 1. Active + Linger=yes -> pass
      const runnerOk = new MockCommandRunner();
      runnerOk.responses.set("is-active", { exitCode: 0, stdout: "active", stderr: "" });
      runnerOk.responses.set("systemctl --user show ", {
        exitCode: 0,
        stdout: "MainPID=4321",
        stderr: "",
      });
      runnerOk.responses.set("loginctl show-user", {
        exitCode: 0,
        stdout: "Linger=yes",
        stderr: "",
      });

      const okReport = await runDoctorChecks(
        { ...fixture.options, serviceName },
        { ...fixture.deps, runner: runnerOk },
      );
      expect(okReport.checks.find((c) => c.id === "service")?.status).toBe("pass");
      expect(okReport.checks.find((c) => c.id === "service")?.message).toContain("PID 4321");

      // 2. Active + Linger=no -> warn
      const runnerNoLinger = new MockCommandRunner();
      runnerNoLinger.responses.set("is-active", { exitCode: 0, stdout: "active", stderr: "" });
      runnerNoLinger.responses.set("systemctl --user show ", {
        exitCode: 0,
        stdout: "MainPID=4321",
        stderr: "",
      });
      runnerNoLinger.responses.set("loginctl show-user", {
        exitCode: 0,
        stdout: "Linger=no",
        stderr: "",
      });

      const lingerWarn = await runDoctorChecks(
        { ...fixture.options, serviceName },
        { ...fixture.deps, runner: runnerNoLinger },
      );
      expect(lingerWarn.checks.find((c) => c.id === "service")?.status).toBe("warn");
      expect(lingerWarn.checks.find((c) => c.id === "service")?.message).toContain("lingering");

      // 3. Stopped -> warn
      const runnerStopped = new MockCommandRunner();
      runnerStopped.responses.set("is-active", { exitCode: 3, stdout: "inactive", stderr: "" });
      runnerStopped.responses.set("show-user", { exitCode: 0, stdout: "Linger=yes", stderr: "" });
      const stoppedReport = await runDoctorChecks(
        { ...fixture.options, serviceName },
        { ...fixture.deps, runner: runnerStopped },
      );
      expect(stoppedReport.checks.find((c) => c.id === "service")?.status).toBe("warn");

      // 4. Failed + unreachable server -> both fail
      const runnerFailed = new MockCommandRunner();
      runnerFailed.responses.set("is-active", { exitCode: 1, stdout: "failed", stderr: "" });
      const failedReport = await runDoctorChecks(
        { ...fixture.options, serviceName },
        { ...fixture.deps, runner: runnerFailed },
      );
      expect(failedReport.checks.find((c) => c.id === "service")?.status).toBe("fail");

      // 5. Active service with unreachable /health -> server fail
      const activeDeadServer = await runDoctorChecks(
        { ...fixture.options, serviceName },
        {
          ...fixture.deps,
          runner: runnerOk,
          fetchFn: async (url) => {
            if (url.includes("/health")) {
              throw new Error("ECONNREFUSED");
            }
            return new Response(JSON.stringify({ version: "0.6.0-rc1" }), { status: 200 });
          },
        },
      );
      expect(activeDeadServer.checks.find((c) => c.id === "server")?.status).toBe("fail");

      // 6. Missing entrypoint inside unit -> service fail
      writeFileSync(
        unitPath,
        `[Service]\nExecStart=${fixture.bunPath} run /nonexistent/index.ts\n`,
      );
      const missingEntryReport = await runDoctorChecks(
        { ...fixture.options, serviceName },
        { ...fixture.deps, runner: runnerOk },
      );
      expect(missingEntryReport.checks.find((c) => c.id === "service")?.status).toBe("fail");
      expect(missingEntryReport.checks.find((c) => c.id === "service")?.message).toContain(
        "entrypoint missing",
      );
    } finally {
      process.env.HOME = origHome;
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("detects port conflicts and probes a real ephemeral /health server", async () => {
    const fixture = createHealthyFixture();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/health") {
          return Response.json({ status: "ok" });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const liveReport = await runDoctorChecks(
        { ...fixture.options, port: server.port, offline: true },
        { ...fixture.deps, fetchFn: fetch },
      );
      const serverCheck = liveReport.checks.find((c) => c.id === "server");
      expect(serverCheck?.status).toBe("pass");
      expect(serverCheck?.message).toContain(`127.0.0.1:${server.port}/health`);

      const conflictReport = await runDoctorChecks(fixture.options, {
        ...fixture.deps,
        fetchFn: async (url) => {
          if (url.includes("/health")) {
            return new Response("other app", { status: 200 });
          }
          return new Response(JSON.stringify({ version: "0.6.0-rc1" }), { status: 200 });
        },
      });
      expect(conflictReport.checks.find((c) => c.id === "server")?.status).toBe("fail");
    } finally {
      server.stop(true);
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("skips registry fetch with --offline and emits valid JSON with --json", async () => {
    const fixture = createHealthyFixture();
    try {
      let registryCalled = false;
      const logs: string[] = [];
      const code = await handleDoctorCommand(
        [
          "doctor",
          "--config",
          fixture.configPath,
          "--name",
          "knife-doctor-nonexistent",
          "--offline",
          "--json",
        ],
        {
          ...fixture.deps,
          fetchFn: async (url) => {
            if (url.includes("registry.npmjs.org")) {
              registryCalled = true;
            }
            return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
          },
          log: (line) => logs.push(line),
        },
      );

      expect(code).toBe(0);
      expect(registryCalled).toBe(false);
      const parsed = JSON.parse(logs.join("\n")) as {
        ok: boolean;
        checks: Array<{ id: string; status: string }>;
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.checks.find((c) => c.id === "update")?.status).toBe("info");
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("formats report summary and hints cleanly", () => {
    const formatted = formatDoctorReport({
      version: "0.6.0-rc1",
      ok: false,
      summary: { pass: 1, warn: 1, fail: 1, info: 1 },
      checks: [
        { id: "a", label: "Check A", status: "pass", message: "all good" },
        { id: "b", label: "Check B", status: "warn", message: "minor issue", hint: "do X" },
        { id: "c", label: "Check C", status: "fail", message: "broken", hint: "fix Y" },
        { id: "d", label: "Check D", status: "info", message: "note" },
      ],
    });
    expect(formatted).toContain("Knife Doctor (v0.6.0-rc1)");
    expect(formatted).toContain("Fix: do X");
    expect(formatted).toContain("Fix: fix Y");
    expect(formatted).toContain("1 passed, 1 warnings, 1 failed, 1 info");
  });
});

describe("CLI Subprocess Smoke Tests", () => {
  it("runs `knife doctor --offline --json` end-to-end via server/index.ts", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "knife-cli-smoke-"));
    const cfgPath = join(tmp, "config.json");
    writeFileSync(
      cfgPath,
      JSON.stringify({
        host: "127.0.0.1",
        port: 49999,
        publicDomain: "smoke.example.com",
        publicScheme: "https",
        auth: {
          githubClientId: "smoke-id",
          githubClientSecret: "SMOKE_SECRET_NEVER_PRINT",
          allowedUsername: "kilip",
        },
        sessionSecret: "SMOKE_SESSION_NEVER_PRINT",
      }),
      { mode: 0o600 },
    );

    try {
      const proc = Bun.spawn(
        [
          "bun",
          "run",
          "server/index.ts",
          "doctor",
          "--offline",
          "--json",
          "--config",
          cfgPath,
          "--name",
          "knife-smoke-nonexistent",
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            HOME: tmp,
            KNIFE_DATA_DIR: join(tmp, "data"),
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(stderr).toBe("");
      expect(stdout).not.toContain("SMOKE_SECRET_NEVER_PRINT");
      expect(stdout).not.toContain("SMOKE_SESSION_NEVER_PRINT");
      const parsed = JSON.parse(stdout) as {
        ok: boolean;
        version: string;
        checks: Array<{ id: string }>;
      };
      expect(typeof parsed.version).toBe("string");
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed.checks.some((c) => c.id === "pty")).toBe(true);
      expect([0, 1]).toContain(exitCode);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("runs `knife self-update --help` end-to-end via server/index.ts", async () => {
    const proc = Bun.spawn(["bun", "run", "server/index.ts", "self-update", "--help"], {
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Knife Self-Update");
    expect(stdout).toContain("--check");
    expect(stdout).toContain("--no-restart");
  });
});
