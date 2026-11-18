import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { QuickKeysBar } from "../app/features/terminal/QuickKeysBar";

describe("QuickKeysBar & Terminal Keyboard Helpers", () => {
  it("renders all required quick keys: ESC, TAB, Ctrl+C, Ctrl+V, Up, Down", () => {
    const noop = () => {};

    const html = renderToString(
      React.createElement(QuickKeysBar, {
        onEsc: noop,
        onTab: noop,
        onCtrlC: noop,
        onCtrlV: noop,
        onArrowUp: noop,
        onArrowDown: noop,
        onClose: noop,
      }),
    );

    expect(html).toContain("ESC");
    expect(html).toContain("TAB");
    expect(html).toContain("Ctrl+C");
    expect(html).toContain("Ctrl+V");
    expect(html).toContain('aria-label="Previous Command"');
    expect(html).toContain('aria-label="Next Command"');
    expect(html).toContain('aria-label="Hide Quick Keys Bar"');
    expect(html).toContain('role="toolbar"');
  });

  it("verifies terminal escape sequence standards", () => {
    const sequences = {
      esc: "\x1b",
      tab: "\t",
      sigint: "\x03",
      arrowUp: "\x1b[A",
      arrowDown: "\x1b[B",
    };

    expect(sequences.esc).toBe("\x1b");
    expect(sequences.tab).toBe("\t");
    expect(sequences.sigint).toBe("\x03");
    expect(sequences.arrowUp).toBe("\x1b[A");
    expect(sequences.arrowDown).toBe("\x1b[B");
  });

  it("verifies Ctrl+B moved to Ctrl+E in README.md and components", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    expect(readme).toMatch(/<kbd>Ctrl<\/kbd> \+ <kbd>E<\/kbd>\s*\|\s*Toggle file browser sidebar/);
    expect(readme).not.toMatch(
      /<kbd>Ctrl<\/kbd> \+ <kbd>B<\/kbd>\s*\|\s*Toggle file browser sidebar/,
    );

    const tabBar = readFileSync(join(process.cwd(), "app/features/tabs/TabBar.tsx"), "utf8");
    expect(tabBar).toContain("Toggle File Browser (Ctrl+E)");
    expect(tabBar).toContain("Ctrl + E");

    const fileBrowserPanel = readFileSync(
      join(process.cwd(), "app/features/file-browser/FileBrowserPanel.tsx"),
      "utf8",
    );
    expect(fileBrowserPanel).toContain("Close sidebar (Ctrl+E)");

    const shortcuts = readFileSync(
      join(process.cwd(), "app/features/terminal/useKeyboardShortcuts.ts"),
      "utf8",
    );
    expect(shortcuts).toContain('e.key === "e" || e.key === "E"');

    const terminalTab = readFileSync(
      join(process.cwd(), "app/features/terminal/useXterm.ts"),
      "utf8",
    );
    expect(terminalTab).toMatch(/"e",\s*"E"/);
    // Ensure Ctrl+B is no longer intercepted in attachCustomKeyEventHandler
    expect(terminalTab).not.toMatch(/"b",\s*"B"/);
  });
});
