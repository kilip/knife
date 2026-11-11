import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveConfigPath } from "./config";

export interface TabData {
  id: string;
  name: string;
  sessionName: string;
  order: number;
  createdAt: number;
}

export function resolveDataDir(): string {
  if (process.env.KNIFE_DATA_DIR) {
    return resolve(process.env.KNIFE_DATA_DIR);
  }
  const configPath = resolveConfigPath();
  const adjacentData = join(dirname(configPath), "data");
  if (existsSync(adjacentData)) {
    return adjacentData;
  }
  const cwdData = join(process.cwd(), "data");
  if (existsSync(cwdData)) {
    return cwdData;
  }
  return adjacentData;
}

export function getTabsPath(): string {
  return join(resolveDataDir(), "tabs.json");
}

export function loadTabs(): TabData[] {
  const tabsPath = getTabsPath();
  if (!existsSync(tabsPath)) {
    return [];
  }
  try {
    const raw = readFileSync(tabsPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.sort((a, b) => a.order - b.order);
    }
  } catch (e) {
    console.error("Error reading tabs.json:", e);
  }
  return [];
}

export function saveTabs(tabs: TabData[]): void {
  const tabsPath = getTabsPath();
  try {
    const dir = dirname(tabsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(tabsPath, JSON.stringify(tabs, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing tabs.json:", e);
  }
}
