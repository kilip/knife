import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTabs, saveTabs, getTabsPath, type TabData } from "../server/storage";

describe("Tabs Storage and Empty State", () => {
  let tempDir: string;
  const originalDataDir = process.env.KNIFE_DATA_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "knife-tabs-test-"));
    process.env.KNIFE_DATA_DIR = tempDir;
  });

  afterEach(() => {
    delete process.env.KNIFE_DATA_DIR;
    if (originalDataDir) {
      process.env.KNIFE_DATA_DIR = originalDataDir;
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns empty array when tabs.json does not exist", () => {
    expect(existsSync(getTabsPath())).toBe(false);
    const tabs = loadTabs();
    expect(tabs).toEqual([]);
  });

  it("persists empty array when all tabs are closed", () => {
    saveTabs([]);
    expect(existsSync(getTabsPath())).toBe(true);
    const tabs = loadTabs();
    expect(tabs).toEqual([]);
  });

  it("persists and restores multiple tabs in order", () => {
    const mockTabs: TabData[] = [
      { id: "tab-1", name: "Shell 1", sessionName: "knife-tab-1", order: 0, createdAt: 100 },
      { id: "tab-2", name: "Shell 2", sessionName: "knife-tab-2", order: 1, createdAt: 200 },
    ];
    saveTabs(mockTabs);
    const loaded = loadTabs();
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe("tab-1");
    expect(loaded[1].id).toBe("tab-2");
  });
});

describe("Adjacent tab selection on close", () => {
  function getNextActiveTabId(tabs: Array<{ id: string }>, closedId: string): string {
    const index = tabs.findIndex((t) => t.id === closedId);
    if (index > 0) {
      return tabs[index - 1].id;
    }
    if (tabs.length > 1) {
      return tabs[1].id;
    }
    return "";
  }

  it("selects left adjacent tab when middle or last tab closes", () => {
    const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(getNextActiveTabId(tabs, "b")).toBe("a");
    expect(getNextActiveTabId(tabs, "c")).toBe("b");
  });

  it("selects right adjacent tab when first tab closes", () => {
    const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(getNextActiveTabId(tabs, "a")).toBe("b");
  });

  it("returns empty string when only remaining tab closes", () => {
    const tabs = [{ id: "a" }];
    expect(getNextActiveTabId(tabs, "a")).toBe("");
  });
});
