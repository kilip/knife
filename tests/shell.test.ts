import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { PtySession } from "../server/features/terminal/pty";
import { getShellName, getUserShell } from "../server/features/terminal/shell";

describe("User Shell Detection and Direct PTY", () => {
  it("resolves a valid, executable user shell", () => {
    const shell = getUserShell();
    expect(typeof shell).toBe("string");
    expect(shell.length).toBeGreaterThan(0);
    expect(existsSync(shell)).toBe(true);
  });

  it("extracts a sensible shell name", () => {
    const shell = getUserShell();
    const name = getShellName(shell);
    expect(["zsh", "bash", "fish", "sh", "dash"]).toContain(name);
  });

  it("spawns direct user shell PTY, executes commands, buffers output, and tracks cwd", async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    let collectedOutput = "";

    const pty = new PtySession({
      tabId: "test-direct-shell",
      cols: 80,
      rows: 24,
      onData: (data) => {
        collectedOutput += data;
        if (collectedOutput.includes("knife_shell_test_ok")) {
          resolve(collectedOutput);
        }
      },
    });

    // Verify initial cwd
    const cwd = pty.getCwd();
    expect(cwd).not.toBeNull();

    // Write command
    pty.write("echo knife_shell_test_ok\n");

    const result = await promise;
    expect(result).toContain("knife_shell_test_ok");

    // Verify buffer was retained
    expect(pty.getBuffer()).toContain("knife_shell_test_ok");

    // Clean up
    pty.close();
  });

  it("returns null from PtySession.getCwd() on non-Linux platforms without throwing", () => {
    const pty = new PtySession({
      tabId: "test-non-linux-cwd",
      cols: 80,
      rows: 24,
    });

    const originalDescriptor = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });

    try {
      expect(pty.getCwd()).toBeNull();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(process, "platform", originalDescriptor);
      }
      pty.close();
    }
  });
});
