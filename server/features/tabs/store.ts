import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { TabData } from "@shared/tabs";
import { resolveConfigPath } from "../../config";
import { getShellName } from "../terminal/shell";

export type { TabData };

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

function isValidTabEntry(entry: unknown): entry is TabData {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const candidate = entry as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.order === "number" &&
    Number.isFinite(candidate.order)
  );
}

function quarantineCorruptTabs(tabsPath: string): void {
  const corruptPath = `${tabsPath}.corrupt-${Date.now()}`;
  try {
    renameSync(tabsPath, corruptPath);
    console.warn(`[storage] Invalid or unreadable tabs.json; moved to ${basename(corruptPath)}`);
  } catch (renameErr) {
    console.warn(
      `[storage] Invalid or unreadable tabs.json; failed to rename to ${basename(corruptPath)}:`,
      renameErr,
    );
  }
}

export function loadTabs(): TabData[] {
  const tabsPath = getTabsPath();
  if (!existsSync(tabsPath)) {
    return [];
  }
  try {
    const raw = readFileSync(tabsPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      quarantineCorruptTabs(tabsPath);
      return [];
    }
    return parsed
      .filter(isValidTabEntry)
      .map(({ id, name, order, createdAt }) => ({
        id,
        name,
        order,
        createdAt:
          typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : Date.now(),
      }))
      .sort((a, b) => a.order - b.order);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    quarantineCorruptTabs(tabsPath);
    return [];
  }
}

export function saveTabs(tabs: TabData[]): void {
  const tabsPath = getTabsPath();
  const dir = dirname(tabsPath);
  mkdirSync(dir, { recursive: true });

  const cleanTabs = tabs.map(({ id, name, order, createdAt }) => ({
    id,
    name,
    order,
    createdAt,
  }));
  const tmpPath = join(dir, `.tabs.${process.pid}.${crypto.randomUUID()}.tmp`);

  try {
    writeFileSync(tmpPath, JSON.stringify(cleanTabs, null, 2), "utf-8");
    renameSync(tmpPath, tabsPath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup error if temp file was never created or already moved
    }
    throw err;
  }
}

export function initTabs(): TabData[] {
  try {
    const tabs = loadTabs();
    if (tabs.length === 0 && !existsSync(getTabsPath())) {
      tabs.push({
        id: crypto.randomUUID().slice(0, 8),
        name: `${getShellName()} 1`,
        order: 0,
        createdAt: Date.now(),
      });
      saveTabs(tabs);
    }
    return tabs;
  } catch (err) {
    console.error("[server] Failed to initialize tabs:", err);
    return [];
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
