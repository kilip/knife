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

export interface UserSettings {
  theme: string;
  compactTabs: boolean;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  bellStyle: "none" | "visual" | "sound";
  defaultQuickKeys: boolean;
  confirmCloseTab: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "catppuccin-mocha",
  compactTabs: false,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 15,
  lineHeight: 1.2,
  cursorStyle: "block",
  cursorBlink: false,
  scrollback: 5000,
  copyOnSelect: false,
  bellStyle: "none",
  defaultQuickKeys: false,
  confirmCloseTab: false,
};

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

export function getSettingsPath(): string {
  return join(resolveDataDir(), "settings.json");
}

export function loadSettings(defaultTheme?: string): UserSettings {
  const base: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    ...(defaultTheme ? { theme: defaultTheme } : {}),
  };
  const settingsPath = getSettingsPath();
  if (!existsSync(settingsPath)) {
    return base;
  }
  try {
    const raw = readFileSync(settingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return { ...base, ...parsed };
    }
  } catch (e) {
    console.error("Error reading settings.json:", e);
  }
  return base;
}

export function saveSettings(patch: Partial<UserSettings>, defaultTheme?: string): UserSettings {
  const current = loadSettings(defaultTheme);
  const updated: UserSettings = { ...current, ...patch };
  const settingsPath = getSettingsPath();
  try {
    const dir = dirname(settingsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(settingsPath, JSON.stringify(updated, null, 2), "utf-8");
  } catch (e) {
    console.error("Error writing settings.json:", e);
  }
  return updated;
}
