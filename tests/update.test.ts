import { beforeEach, describe, expect, it } from "bun:test";
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  handleSelfUpdateCommand,
  parseSelfUpdateCliArgs,
  runSelfUpdate,
} from "../server/features/update/cli";
import {
  buildPackageManagerInfo,
  checkLatestVersion,
  clearVersionCache,
  compareSemver,
  detectPackageManager,
  executePackageUpdate,
  type FetchLike,
  getCurrentVersion,
  isValidTargetVersion,
  type PackageManagerInfo,
  parseSemver,
} from "../server/features/update/update";
import type { CommandResult, CommandRunner } from "../server/service/types";

type SpawnFn = typeof spawn;

function createMockSpawn(options: { stdout?: string; stderr?: string; exitCode?: number }): {
  spawnFn: SpawnFn;
  calls: Array<{ cmd: string; args: string[] }>;
} {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const spawnFn = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    const ee = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    ee.stdout = new EventEmitter();
    ee.stderr = new EventEmitter();
    setTimeout(() => {
      if (options.stdout) ee.stdout.emit("data", Buffer.from(options.stdout));
      if (options.stderr) ee.stderr.emit("data", Buffer.from(options.stderr));
      ee.emit("close", options.exitCode ?? 0);
    }, 5);
    return ee as unknown as ReturnType<SpawnFn>;
  }) as unknown as SpawnFn;
  return { spawnFn, calls };
}

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

describe("Semver parsing and comparison", () => {
  it("parses valid standard semver strings", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: undefined,
    });
    expect(parseSemver("v2.0.10")).toEqual({
      major: 2,
      minor: 0,
      patch: 10,
      prerelease: undefined,
    });
    expect(parseSemver(" 1.0.0-beta.1 ")).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: "beta.1",
    });
  });

  it("returns null on invalid semver strings", () => {
    expect(parseSemver("invalid")).toBeNull();
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("")).toBeNull();
  });

  it("correctly compares semver versions", () => {
    // Greater
    expect(compareSemver("1.1.0", "1.0.0")).toBe(1);
    expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("1.2.0", "1.2.0-beta")).toBe(1);

    // Lesser
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);

    // Equal
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(compareSemver("v1.2.3", "1.2.3")).toBe(0);
    expect(compareSemver("1.0.0-rc.1", "1.0.0-rc.1")).toBe(0);
  });
});

describe("Current version discovery", () => {
  it("reads current version from package.json", () => {
    const pkgJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as {
      version: string;
    };
    const version = getCurrentVersion();
    expect(typeof version).toBe("string");
    expect(parseSemver(version)).not.toBeNull();
    expect(version).toBe(pkgJson.version);
  });

  it("falls back to 0.0.0 when package.json is missing", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "knife-version-missing-"));
    try {
      expect(getCurrentVersion(emptyDir)).toBe("0.0.0");
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe("Target version & package manager helpers", () => {
  it("validates version strings and dist-tags", () => {
    expect(isValidTargetVersion("latest")).toBe(true);
    expect(isValidTargetVersion("next")).toBe(true);
    expect(isValidTargetVersion("0.6.0-rc1")).toBe(true);
    expect(isValidTargetVersion("v1.2.3")).toBe(true);
    expect(isValidTargetVersion("")).toBe(false);
    expect(isValidTargetVersion("../evil")).toBe(false);
    expect(isValidTargetVersion("1.0.0;rm")).toBe(false);
    expect(isValidTargetVersion("1.0..0")).toBe(false);
  });

  it("builds package manager commands for explicit target versions", () => {
    expect(buildPackageManagerInfo("bun", "0.7.0")).toEqual({
      type: "bun",
      command: "bun",
      args: ["add", "-g", "@kilip/knife@0.7.0"],
    });
    expect(buildPackageManagerInfo("npm", "next")).toEqual({
      type: "npm",
      command: "npm",
      args: ["install", "-g", "@kilip/knife@next"],
    });
  });

  it("passes custom target version through detectPackageManager", () => {
    const res = detectPackageManager("/usr/local/bin/bun", {}, true, "1.2.3");
    expect(res.args).toEqual(["add", "-g", "@kilip/knife@1.2.3"]);
  });
});

describe("Package manager detection", () => {
  it("detects bun when execPath contains bun", () => {
    const result = detectPackageManager("/usr/local/bin/bun", {});
    expect(result.type).toBe("bun");
    expect(result.command).toBe("bun");
    expect(result.args).toEqual(["add", "-g", "@kilip/knife@latest"]);
  });

  it("detects bun when BUN_INSTALL is set in env", () => {
    const result = detectPackageManager("/usr/bin/node", {
      BUN_INSTALL: "/home/user/.bun",
    });
    expect(result.type).toBe("bun");
  });

  it("detects npm when running on standard node without Bun indicators", () => {
    const result = detectPackageManager("/usr/local/bin/node", {}, false);
    expect(result.type).toBe("npm");
    expect(result.command).toBe("npm");
    expect(result.args).toEqual(["install", "-g", "@kilip/knife@latest"]);
  });
});

describe("Registry version checking and caching", () => {
  beforeEach(() => {
    clearVersionCache();
  });

  it("detects when update is available from registry", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ version: "2.0.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await checkLatestVersion("1.0.0", true, mockFetch as any);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("2.0.0");
    expect(result.updateAvailable).toBe(true);
    expect(result.cached).toBe(false);
  });

  it("detects when already on latest version", async () => {
    const mockFetch = async () =>
      new Response(JSON.stringify({ version: "1.0.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    const result = await checkLatestVersion("1.0.0", true, mockFetch as any);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("1.0.0");
    expect(result.updateAvailable).toBe(false);
  });

  it("uses cached result within TTL when force is false", async () => {
    let fetchCalls = 0;
    const mockFetch = async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ version: "1.5.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const first = await checkLatestVersion("1.0.0", false, mockFetch as any);
    expect(first.cached).toBe(false);
    expect(fetchCalls).toBe(1);

    const second = await checkLatestVersion("1.0.0", false, mockFetch as any);
    expect(second.cached).toBe(true);
    expect(fetchCalls).toBe(1);

    // With force=true, bypasses cache
    const third = await checkLatestVersion("1.0.0", true, mockFetch as any);
    expect(third.cached).toBe(false);
    expect(fetchCalls).toBe(2);
  });

  it("handles registry network errors gracefully and includes error message", async () => {
    const mockFetch: FetchLike = async () => {
      throw new Error("Network unreachable");
    };

    const result = await checkLatestVersion("1.0.0", true, mockFetch);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("1.0.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("Network unreachable");
  });

  it("queries custom dist-tag without polluting latest cache", async () => {
    const requestedUrls: string[] = [];
    const mockFetch: FetchLike = async (url) => {
      requestedUrls.push(url);
      const version = url.endsWith("/next") ? "2.0.0-rc1" : "1.5.0";
      return new Response(JSON.stringify({ version }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const latestRes = await checkLatestVersion("1.0.0", false, mockFetch, "latest");
    expect(latestRes.latestVersion).toBe("1.5.0");
    expect(latestRes.cached).toBe(false);

    const nextRes = await checkLatestVersion("1.0.0", false, mockFetch, "next");
    expect(nextRes.latestVersion).toBe("2.0.0-rc1");
    expect(nextRes.cached).toBe(false);

    const cachedLatest = await checkLatestVersion("1.0.0", false, mockFetch, "latest");
    expect(cachedLatest.latestVersion).toBe("1.5.0");
    expect(cachedLatest.cached).toBe(true);
    expect(requestedUrls).toEqual([
      "https://registry.npmjs.org/@kilip/knife/latest",
      "https://registry.npmjs.org/@kilip/knife/next",
    ]);
  });
});

describe("Update command execution and log streaming", () => {
  it("streams stdout and stderr lines and reports success", async () => {
    const logs: string[] = [];

    const mockSpawn = () => {
      const ee = new EventEmitter() as any;
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();

      setTimeout(() => {
        ee.stdout.emit("data", Buffer.from("Resolving packages...\nDownloading @kilip/knife\n"));
        ee.stderr.emit("data", Buffer.from("warn: optional dependency skipped\n"));
        ee.emit("close", 0);
      }, 10);

      return ee;
    };

    const pkg: PackageManagerInfo = {
      type: "bun",
      command: "bun",
      args: ["add", "-g", "@kilip/knife@latest"],
    };

    const res = await executePackageUpdate((line) => logs.push(line), pkg, mockSpawn as any);

    expect(res.success).toBe(true);
    expect(res.exitCode).toBe(0);
    expect(logs.some((l) => l.includes("Resolving packages"))).toBe(true);
    expect(logs.some((l) => l.includes("Downloading @kilip/knife"))).toBe(true);
    expect(logs.some((l) => l.includes("warn: optional dependency skipped"))).toBe(true);
  });

  it("captures failure exit code and error message", async () => {
    const logs: string[] = [];

    const mockSpawn = () => {
      const ee = new EventEmitter() as any;
      ee.stdout = new EventEmitter();
      ee.stderr = new EventEmitter();

      setTimeout(() => {
        ee.stderr.emit("data", Buffer.from("EACCES: permission denied\n"));
        ee.emit("close", 1);
      }, 10);

      return ee;
    };

    const pkg: PackageManagerInfo = {
      type: "npm",
      command: "npm",
      args: ["install", "-g", "@kilip/knife@latest"],
    };

    const res = await executePackageUpdate((line) => logs.push(line), pkg, mockSpawn as any);

    expect(res.success).toBe(false);
    expect(res.exitCode).toBe(1);
    expect(res.error).toBeDefined();
    expect(logs.some((l) => l.includes("permission denied"))).toBe(true);
  });
});

describe("Self-Update CLI Argument Parsing", () => {
  it("returns null for non self-update invocations", () => {
    expect(parseSelfUpdateCliArgs([])).toBeNull();
    expect(parseSelfUpdateCliArgs(["doctor"])).toBeNull();
    expect(parseSelfUpdateCliArgs(["--port", "3000"])).toBeNull();
  });

  it("parses all supported options including inline syntax", () => {
    const parsed = parseSelfUpdateCliArgs([
      "self-update",
      "--check",
      "-f",
      "--no-restart",
      "--version=v1.2.3",
      "--pm",
      "npm",
      "--name=custom-knife",
      "--system",
    ]);
    expect(parsed).toEqual({
      check: true,
      force: true,
      noRestart: true,
      version: "1.2.3",
      packageManager: "npm",
      serviceName: "custom-knife",
      system: true,
      help: false,
    });
  });

  it("preserves dist-tags and supports --user and -h", () => {
    const parsed = parseSelfUpdateCliArgs([
      "self-update",
      "--version",
      "next",
      "--pm=bun",
      "--user",
      "-h",
    ]);
    expect(parsed).toEqual({
      check: false,
      force: false,
      noRestart: false,
      version: "next",
      packageManager: "bun",
      serviceName: "knife",
      system: false,
      help: true,
    });
  });

  it("throws on missing values, invalid options, and unknown flags", () => {
    expect(() => parseSelfUpdateCliArgs(["self-update", "--version"])).toThrow("Missing value");
    expect(() => parseSelfUpdateCliArgs(["self-update", "--version", "--check"])).toThrow(
      "Missing value",
    );
    expect(() => parseSelfUpdateCliArgs(["self-update", "--version="])).toThrow("Missing value");
    expect(() => parseSelfUpdateCliArgs(["self-update", "--version", "../bad"])).toThrow(
      "Invalid target version",
    );
    expect(() => parseSelfUpdateCliArgs(["self-update", "--pm", "yarn"])).toThrow(
      "Invalid package manager",
    );
    expect(() => parseSelfUpdateCliArgs(["self-update", "--bogus"])).toThrow("Unknown option");
  });
});

describe("Self-Update CLI Execution", () => {
  function makeTempPackageRoot(withGit: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), "knife-self-update-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "@kilip/knife", version: "0.6.0" }),
    );
    if (withGit) {
      mkdirSync(join(dir, ".git"));
    }
    return dir;
  }

  it("prints help and returns 0", async () => {
    const logs: string[] = [];
    const code = await handleSelfUpdateCommand(["self-update", "--help"], {
      log: (line) => logs.push(line),
    });
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("Knife Self-Update");
  });

  it("handles --check for available update, up-to-date, and ahead states", async () => {
    const pkgRoot = makeTempPackageRoot(true);
    try {
      const logs1: string[] = [];
      const code1 = await runSelfUpdate(
        { check: true, force: false, noRestart: false, serviceName: "knife", help: false },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          fetchFn: async () => new Response(JSON.stringify({ version: "0.7.0" }), { status: 200 }),
          log: (line) => logs1.push(line),
        },
      );
      expect(code1).toBe(0);
      expect(logs1.join("\n")).toContain("source checkout");
      expect(logs1.join("\n")).toContain("Update available: v0.6.0 -> v0.7.0");

      const logs2: string[] = [];
      const code2 = await runSelfUpdate(
        { check: true, force: false, noRestart: false, serviceName: "knife", help: false },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          fetchFn: async () => new Response(JSON.stringify({ version: "0.6.0" }), { status: 200 }),
          log: (line) => logs2.push(line),
        },
      );
      expect(code2).toBe(0);
      expect(logs2.join("\n")).toContain("up to date");

      const logs3: string[] = [];
      const code3 = await runSelfUpdate(
        {
          check: true,
          force: false,
          noRestart: false,
          version: "0.5.0",
          serviceName: "knife",
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          fetchFn: async () => new Response(JSON.stringify({ version: "0.5.0" }), { status: 200 }),
          log: (line) => logs3.push(line),
        },
      );
      expect(code3).toBe(0);
      expect(logs3.join("\n")).toContain("ahead of");
    } finally {
      rmSync(pkgRoot, { recursive: true, force: true });
    }
  });

  it("blocks install in source checkout unless --force is given", async () => {
    const pkgRoot = makeTempPackageRoot(true);
    try {
      const warns: string[] = [];
      const code = await runSelfUpdate(
        { check: false, force: false, noRestart: false, serviceName: "knife", help: false },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          warn: (line) => warns.push(line),
        },
      );
      expect(code).toBe(1);
      expect(warns.join("\n")).toContain("local git checkout");

      const { spawnFn, calls } = createMockSpawn({ stdout: "installed\n", exitCode: 0 });
      const logs: string[] = [];
      const forcedCode = await runSelfUpdate(
        {
          check: false,
          force: true,
          noRestart: true,
          packageManager: "npm",
          serviceName: "knife-nonexistent-test",
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          platform: "linux",
          runner: new MockCommandRunner(),
          fetchFn: async () => new Response(JSON.stringify({ version: "0.6.0" }), { status: 200 }),
          spawnFn,
          log: (line) => logs.push(line),
          warn: (line) => warns.push(line),
        },
      );
      expect(forcedCode).toBe(0);
      expect(calls[0]).toEqual({ cmd: "npm", args: ["install", "-g", "@kilip/knife@latest"] });
    } finally {
      rmSync(pkgRoot, { recursive: true, force: true });
    }
  });

  it("short-circuits when already up to date, but allows explicit downgrades", async () => {
    const pkgRoot = makeTempPackageRoot(false);
    try {
      const logs: string[] = [];
      const { spawnFn, calls } = createMockSpawn({ exitCode: 0 });

      const upToDateCode = await runSelfUpdate(
        {
          check: false,
          force: false,
          noRestart: false,
          serviceName: "knife-nonexistent",
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          fetchFn: async () => new Response(JSON.stringify({ version: "0.6.0" }), { status: 200 }),
          spawnFn,
          log: (line) => logs.push(line),
        },
      );
      expect(upToDateCode).toBe(0);
      expect(calls).toHaveLength(0);
      expect(logs.join("\n")).toContain("already at v0.6.0");

      const downgradeCode = await runSelfUpdate(
        {
          check: false,
          force: false,
          noRestart: false,
          version: "0.5.0",
          packageManager: "bun",
          serviceName: "knife-nonexistent",
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          platform: "linux",
          runner: new MockCommandRunner(),
          fetchFn: async () => new Response(JSON.stringify({ version: "0.5.0" }), { status: 200 }),
          spawnFn,
          log: (line) => logs.push(line),
        },
      );
      expect(downgradeCode).toBe(0);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ cmd: "bun", args: ["add", "-g", "@kilip/knife@0.5.0"] });
    } finally {
      rmSync(pkgRoot, { recursive: true, force: true });
    }
  });

  it("handles registry errors with and without --force and reports package manager failures", async () => {
    const pkgRoot = makeTempPackageRoot(false);
    try {
      const errors: string[] = [];
      const failCheckCode = await runSelfUpdate(
        { check: false, force: false, noRestart: false, serviceName: "knife", help: false },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          fetchFn: async () => {
            throw new Error("DNS failure");
          },
          error: (line) => errors.push(line),
        },
      );
      expect(failCheckCode).toBe(1);
      expect(errors.join("\n")).toContain("DNS failure");
      expect(errors.join("\n")).toContain("--force");

      const warns: string[] = [];
      const errors2: string[] = [];
      const { spawnFn } = createMockSpawn({ stderr: "EACCES permission denied", exitCode: 1 });
      const pmFailCode = await runSelfUpdate(
        {
          check: false,
          force: true,
          noRestart: false,
          packageManager: "npm",
          serviceName: "knife",
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          fetchFn: async () => {
            throw new Error("timeout");
          },
          spawnFn,
          warn: (line) => warns.push(line),
          error: (line) => errors2.push(line),
        },
      );
      expect(pmFailCode).toBe(1);
      expect(warns.join("\n")).toContain("continuing because --force");
      expect(errors2.join("\n")).toContain("npm install -g @kilip/knife@latest");
    } finally {
      rmSync(pkgRoot, { recursive: true, force: true });
    }
  });

  it("restarts active background service, respects --no-restart, and handles stopped or failing service", async () => {
    const pkgRoot = makeTempPackageRoot(false);
    const fakeHome = mkdtempSync(join(tmpdir(), "knife-svc-home-"));
    const unitDir = join(fakeHome, ".config", "systemd", "user");
    mkdirSync(unitDir, { recursive: true });
    const serviceName = "knife-update-svc-test";
    writeFileSync(join(unitDir, `${serviceName}.service`), "[Service]\nExecStart=/usr/bin/bun\n");

    const origHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      const runner1 = new MockCommandRunner();
      runner1.responses.set("is-active", { exitCode: 0, stdout: "active", stderr: "" });
      const { spawnFn: spawn1 } = createMockSpawn({ stdout: "updated\n", exitCode: 0 });
      const logs1: string[] = [];

      const restartOk = await runSelfUpdate(
        {
          check: false,
          force: false,
          noRestart: false,
          packageManager: "bun",
          serviceName,
          system: false,
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          platform: "linux",
          runner: runner1,
          fetchFn: async () => new Response(JSON.stringify({ version: "0.7.0" }), { status: 200 }),
          spawnFn: spawn1,
          log: (line) => logs1.push(line),
        },
      );
      expect(restartOk).toBe(0);
      expect(runner1.calls.some((c) => c.cmd === "systemctl" && c.args.includes("restart"))).toBe(
        true,
      );
      expect(logs1.join("\n")).toContain(`Restarted background service '${serviceName}'`);

      // --no-restart skips systemctl restart
      const runner2 = new MockCommandRunner();
      runner2.responses.set("is-active", { exitCode: 0, stdout: "active", stderr: "" });
      const { spawnFn: spawn2 } = createMockSpawn({ exitCode: 0 });
      const warns2: string[] = [];

      const noRestartCode = await runSelfUpdate(
        {
          check: false,
          force: false,
          noRestart: true,
          packageManager: "bun",
          serviceName,
          system: false,
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          platform: "linux",
          runner: runner2,
          fetchFn: async () => new Response(JSON.stringify({ version: "0.7.0" }), { status: 200 }),
          spawnFn: spawn2,
          warn: (line) => warns2.push(line),
        },
      );
      expect(noRestartCode).toBe(0);
      expect(runner2.calls.some((c) => c.cmd === "systemctl" && c.args.includes("restart"))).toBe(
        false,
      );
      expect(warns2.join("\n")).toContain("--no-restart");

      // Stopped service logs notice without restart
      const runner3 = new MockCommandRunner();
      runner3.responses.set("is-active", { exitCode: 3, stdout: "inactive", stderr: "" });
      const { spawnFn: spawn3 } = createMockSpawn({ exitCode: 0 });
      const logs3: string[] = [];
      const stoppedCode = await runSelfUpdate(
        {
          check: false,
          force: false,
          noRestart: false,
          packageManager: "bun",
          serviceName,
          system: false,
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          platform: "linux",
          runner: runner3,
          fetchFn: async () => new Response(JSON.stringify({ version: "0.7.0" }), { status: 200 }),
          spawnFn: spawn3,
          log: (line) => logs3.push(line),
        },
      );
      expect(stoppedCode).toBe(0);
      expect(logs3.join("\n")).toContain("installed but not active");

      // Restart failure returns 1
      const runner4 = new MockCommandRunner();
      runner4.responses.set("is-active", { exitCode: 0, stdout: "active", stderr: "" });
      runner4.responses.set("restart", { exitCode: 1, stdout: "", stderr: "systemctl denied" });
      const { spawnFn: spawn4 } = createMockSpawn({ exitCode: 0 });
      const warns4: string[] = [];
      const restartFailCode = await runSelfUpdate(
        {
          check: false,
          force: false,
          noRestart: false,
          packageManager: "bun",
          serviceName,
          system: false,
          help: false,
        },
        {
          packageRoot: pkgRoot,
          currentVersion: "0.6.0",
          platform: "linux",
          runner: runner4,
          fetchFn: async () => new Response(JSON.stringify({ version: "0.7.0" }), { status: 200 }),
          spawnFn: spawn4,
          warn: (line) => warns4.push(line),
        },
      );
      expect(restartFailCode).toBe(1);
      expect(warns4.join("\n")).toContain("systemctl denied");
      expect(existsSync(join(unitDir, `${serviceName}.service`))).toBe(true);
    } finally {
      process.env.HOME = origHome;
      rmSync(fakeHome, { recursive: true, force: true });
      rmSync(pkgRoot, { recursive: true, force: true });
    }
  });
});
