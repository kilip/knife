import { describe, expect, it } from "bun:test";
import {
  clampFontSize,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  parseBoolean,
  parseFontSize,
  parsePositiveInt,
  readStorage,
  STORAGE_KEYS,
  writeStorage,
} from "../app/lib/use-persistent-state";

describe("Persistent State Helpers & Storage Keys", () => {
  it("preserves exact legacy localStorage keys", () => {
    expect(STORAGE_KEYS.THEME).toBe("knife_theme");
    expect(STORAGE_KEYS.FONT_SIZE).toBe("knife_font_size");
    expect(STORAGE_KEYS.SETTINGS).toBe("knife_settings");
    expect(STORAGE_KEYS.FILE_BROWSER_OPEN).toBe("knife_file_browser_open");
    expect(STORAGE_KEYS.QUICK_KEYS_OPEN).toBe("knife_quick_keys_open");
    expect(STORAGE_KEYS.FILE_BROWSER_HIDDEN).toBe("knife_file_browser_hidden");
    expect(STORAGE_KEYS.FILE_BROWSER_WIDTH).toBe("knife_file_browser_width");
  });

  it("validates and clamps font size within 10..32", () => {
    expect(FONT_SIZE_MIN).toBe(10);
    expect(FONT_SIZE_MAX).toBe(32);

    expect(parseFontSize("15")).toBe(15);
    expect(parseFontSize("10")).toBe(10);
    expect(parseFontSize("32")).toBe(32);
    expect(parseFontSize("9")).toBeUndefined();
    expect(parseFontSize("33")).toBeUndefined();
    expect(parseFontSize("abc")).toBeUndefined();
    expect(parseFontSize(null)).toBeUndefined();

    expect(clampFontSize(4)).toBe(10);
    expect(clampFontSize(50)).toBe(32);
    expect(clampFontSize(18)).toBe(18);
  });

  it("parses booleans and positive integers safely", () => {
    expect(parseBoolean("true")).toBe(true);
    expect(parseBoolean("false")).toBe(false);
    expect(parseBoolean("yes")).toBeUndefined();

    expect(parsePositiveInt("300")).toBe(300);
    expect(parsePositiveInt("0")).toBeUndefined();
    expect(parsePositiveInt("-10")).toBeUndefined();
    expect(parsePositiveInt("abc")).toBeUndefined();
  });

  it("handles missing window/localStorage without throwing", () => {
    expect(readStorage(STORAGE_KEYS.THEME)).toBeNull();
    expect(() => writeStorage(STORAGE_KEYS.THEME, "nord")).not.toThrow();
  });
});
