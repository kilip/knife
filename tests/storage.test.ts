import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getTabsPath, loadTabs, saveTabs, type TabData } from "../server/storage";

describe("Atomic Tabs Storage", () => {
  const rootTempDir = mkdtempSync(join(tmpdir(), "knife-storage-suite-"));
  let tempDir: string;
  const originalDataDir = process.env.KNIFE_DATA_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(rootTempDir, "case-"));
    process.env.KNIFE_DATA_DIR = tempDir;
  });

  afterEach(() => {
    chmodSync(tempDir, 0o700);
    if (originalDataDir) {
      process.env.KNIFE_DATA_DIR = originalDataDir;
    } else {
      delete process.env.KNIFE_DATA_DIR;
    }
  });

  afterAll(() => {
    if (existsSync(rootTempDir)) {
      chmodSync(rootTempDir, 0o700);
      rmSync(rootTempDir, { recursive: true, force: true });
    }
  });

  it("round-trips saveTabs and loadTabs without leaving .tmp files", () => {
    const tabs: TabData[] = [
      { id: "t2", name: "Second", order: 1, createdAt: 200 },
      { id: "t1", name: "First", order: 0, createdAt: 100 },
    ];

    saveTabs(tabs);
    const loaded = loadTabs();
    expect(loaded).toEqual([
      { id: "t1", name: "First", order: 0, createdAt: 100 },
      { id: "t2", name: "Second", order: 1, createdAt: 200 },
    ]);

    const files = readdirSync(tempDir);
    expect(files).toEqual(["tabs.json"]);
    expect(files.some((f) => f.includes(".tmp"))).toBe(false);
  });

  it("quarantines corrupt JSON to tabs.json.corrupt-<timestamp> and returns []", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeFileSync(getTabsPath(), "{not-valid-json", "utf-8");

      const loaded = loadTabs();
      expect(loaded).toEqual([]);
      expect(existsSync(getTabsPath())).toBe(false);

      const files = readdirSync(tempDir);
      const corruptFile = files.find((f) => f.startsWith("tabs.json.corrupt-"));
      expect(corruptFile).toBeDefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("quarantines non-array JSON to tabs.json.corrupt-<timestamp> and returns []", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    try {
      writeFileSync(getTabsPath(), JSON.stringify({ id: "not-an-array" }), "utf-8");

      const loaded = loadTabs();
      expect(loaded).toEqual([]);
      expect(existsSync(getTabsPath())).toBe(false);

      const files = readdirSync(tempDir);
      expect(files.some((f) => f.startsWith("tabs.json.corrupt-"))).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("drops invalid tab entries while preserving valid ones", () => {
    const mixed = [
      null,
      "invalid",
      { id: 123, name: "Bad ID", order: 0, createdAt: 1 },
      { id: "missing-name", order: 1, createdAt: 2 },
      { id: "bad-order", name: "Bad Order", order: "0", createdAt: 3 },
      { id: "nan-order", name: "NaN Order", order: Number.NaN, createdAt: 4 },
      { id: "valid-1", name: "Valid Tab", order: 2, createdAt: 500, sessionName: "legacy" },
    ];
    writeFileSync(getTabsPath(), JSON.stringify(mixed), "utf-8");

    const loaded = loadTabs();
    expect(loaded).toEqual([{ id: "valid-1", name: "Valid Tab", order: 2, createdAt: 500 }]);
  });

  it("throws from saveTabs on write failure and cleans up temp files", () => {
    // Replacing target path with a directory causes renameSync to fail even as root
    mkdirSync(getTabsPath());

    expect(() => saveTabs([{ id: "t1", name: "Shell 1", order: 0, createdAt: 100 }])).toThrow();

    const files = readdirSync(tempDir);
    expect(files.some((f) => f.includes(".tmp"))).toBe(false);
  });
});
