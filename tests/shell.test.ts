import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { getUserShell, getShellName, isTmuxInstalled } from "../server/shell";
import { PtySession } from "../server/pty";

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

  it("detects tmux installation status without throwing", () => {
    const hasTmux = isTmuxInstalled();
    expect(typeof hasTmux).toBe("boolean");
  });

  it("spawns direct user shell PTY, executes commands, buffers output, and tracks cwd", async () => {
    const { promise, resolve } = Promise.withResolvers<string>();
    let collectedOutput = "";

    const pty = new PtySession({
      sessionName: "test-direct-shell",
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
});
