import { describe, it, expect } from "bun:test";
import { THEMES, DEFAULT_THEME_ID, getTheme } from "../app/utils/themes";

describe("Theme System", () => {
  it("includes all 5 required built-in themes", () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toContain("catppuccin-mocha");
    expect(ids).toContain("tokyo-night");
    expect(ids).toContain("nord");
    expect(ids).toContain("gruvbox-dark");
    expect(ids).toContain("dracula");
    expect(THEMES.length).toBeGreaterThanOrEqual(5);
  });

  it("defaults to catppuccin-mocha", () => {
    expect(DEFAULT_THEME_ID).toBe("catppuccin-mocha");
    const def = getTheme();
    expect(def.id).toBe("catppuccin-mocha");
  });

  it("every theme defines both UI tokens and xterm 16-color palette", () => {
    for (const theme of THEMES) {
      // UI tokens
      expect(theme.ui.bgBase).toBeDefined();
      expect(theme.ui.bgSurface).toBeDefined();
      expect(theme.ui.border).toBeDefined();
      expect(theme.ui.fgBase).toBeDefined();
      expect(theme.ui.accent).toBeDefined();
      expect(theme.ui.statusOk).toBeDefined();
      expect(theme.ui.statusWarn).toBeDefined();
      expect(theme.ui.statusErr).toBeDefined();

      // xterm terminal palette
      expect(theme.terminal.background).toBeDefined();
      expect(theme.terminal.foreground).toBeDefined();
      expect(theme.terminal.cursor).toBeDefined();
      expect(theme.terminal.black).toBeDefined();
      expect(theme.terminal.red).toBeDefined();
      expect(theme.terminal.green).toBeDefined();
      expect(theme.terminal.yellow).toBeDefined();
      expect(theme.terminal.blue).toBeDefined();
      expect(theme.terminal.magenta).toBeDefined();
      expect(theme.terminal.cyan).toBeDefined();
      expect(theme.terminal.white).toBeDefined();
      expect(theme.terminal.brightBlack).toBeDefined();
      expect(theme.terminal.brightWhite).toBeDefined();
    }
  });

  it("getTheme falls back to default on invalid ID", () => {
    const fallback = getTheme("unknown-theme-xyz");
    expect(fallback.id).toBe("catppuccin-mocha");
  });
});
