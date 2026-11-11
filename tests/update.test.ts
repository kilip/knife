import { describe, expect, it, beforeEach } from "bun:test";
import {
  parseSemver,
  compareSemver,
  detectPackageManager,
  checkLatestVersion,
  clearVersionCache,
  getCurrentVersion,
  executePackageUpdate,
  type PackageManagerInfo,
} from "../server/update";
import { EventEmitter } from "node:events";

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
    const version = getCurrentVersion();
    expect(typeof version).toBe("string");
    expect(parseSemver(version)).not.toBeNull();
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

  it("handles registry network errors gracefully", async () => {
    const mockFetch = async () => {
      throw new Error("Network unreachable");
    };

    const result = await checkLatestVersion("1.0.0", true, mockFetch as any);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("1.0.0");
    expect(result.updateAvailable).toBe(false);
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
