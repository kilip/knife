import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DEFAULT_USER_SETTINGS,
  loadSettings,
  saveSettings,
  getSettingsPath,
} from "../server/storage";

describe("User Settings Storage", () => {
  let tempDir: string;
  const originalDataDir = process.env.KNIFE_DATA_DIR;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "knife-settings-test-"));
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

  it("loads default settings when no settings file exists", () => {
    const settings = loadSettings();
    expect(settings).toEqual(DEFAULT_USER_SETTINGS);
    expect(settings.fontSize).toBe(15);
    expect(settings.theme).toBe("catppuccin-mocha");
    expect(settings.cursorStyle).toBe("block");
    expect(settings.cursorBlink).toBe(false);
    expect(settings.compactTabs).toBe(false);
  });

  it("respects defaultTheme parameter if provided", () => {
    const settings = loadSettings("nord");
    expect(settings.theme).toBe("nord");
    expect(settings.fontSize).toBe(15);
  });

  it("persists partial updates and returns updated settings", () => {
    const updated = saveSettings({
      theme: "dracula",
      fontSize: 18,
      cursorStyle: "bar",
      cursorBlink: true,
      compactTabs: true,
    });

    expect(updated.theme).toBe("dracula");
    expect(updated.fontSize).toBe(18);
    expect(updated.cursorStyle).toBe("bar");
    expect(updated.cursorBlink).toBe(true);
    expect(updated.compactTabs).toBe(true);
    // Preserves untouched defaults
    expect(updated.scrollback).toBe(5000);
    expect(updated.copyOnSelect).toBe(false);

    // Verify written to disk
    const settingsPath = getSettingsPath();
    expect(existsSync(settingsPath)).toBe(true);

    // Reload from disk
    const reloaded = loadSettings();
    expect(reloaded).toEqual(updated);
  });

  it("merges subsequent partial updates incrementally", () => {
    saveSettings({ fontSize: 20 });
    const second = saveSettings({ copyOnSelect: true, bellStyle: "visual" });

    expect(second.fontSize).toBe(20);
    expect(second.copyOnSelect).toBe(true);
    expect(second.bellStyle).toBe("visual");
  });
});
