import { describe, expect, it } from "bun:test";
import { Terminal } from "@xterm/headless";
import { MAX_SNAPSHOT_SCROLLBACK, ScreenSnapshot } from "../server/features/terminal/snapshot";

async function readVisibleLines(data: string, cols = 80, rows = 24): Promise<string[]> {
  const term = new Terminal({
    cols,
    rows,
    scrollback: MAX_SNAPSHOT_SCROLLBACK,
    allowProposedApi: true,
  });
  await new Promise<void>((resolve) => {
    term.write(data, resolve);
  });
  const lines: string[] = [];
  const active = term.buffer.active;
  for (let i = 0; i < rows; i++) {
    const line = active.getLine(active.viewportY + i);
    lines.push(line ? line.translateToString(true) : "");
  }
  term.dispose();
  return lines;
}

describe("ScreenSnapshot headless xterm replay", () => {
  it("replays alternate-screen positioned and colored text accurately", async () => {
    const snapshot = new ScreenSnapshot(80, 24);
    snapshot.write("normal line\r\n");
    // Enter alternate screen, clear, position cursor, write colored text
    snapshot.write("\x1b[?1049h\x1b[2J\x1b[3;5H\x1b[31mALT_SCREEN_HEADER\x1b[0m\x1b[10;1Hrow10");

    const serialized = await snapshot.getSnapshot();
    const lines = await readVisibleLines(serialized, 80, 24);
    snapshot.dispose();

    expect(lines[2]).toBe("    ALT_SCREEN_HEADER");
    expect(lines[9]).toBe("row10");
  });

  it("overflows bounded scrollback with ANSI lines without orphaned escape sequences", async () => {
    const snapshot = new ScreenSnapshot(80, 24, 50);
    // Write 200 colored lines to overflow the 50-line scrollback
    for (let i = 0; i < 200; i++) {
      snapshot.write(`\x1b[38;5;${(i % 200) + 1}mline-${i.toString().padStart(3, "0")}\x1b[0m\r\n`);
    }

    const serialized = await snapshot.getSnapshot();
    snapshot.dispose();

    // Must not start with a partial/orphaned CSI parameter fragment (e.g., "38;5;...m" or "[38;5...")
    expect(serialized).not.toMatch(/^(?:\d+;)*\d+m/);
    expect(serialized).not.toMatch(/^\[[\d;]*m/);
    // Must contain recent lines and drop earliest lines
    expect(serialized).toContain("line-199");
    expect(serialized).not.toContain("line-000");
  });

  it("reflects new dimensions after resize", async () => {
    const snapshot = new ScreenSnapshot(80, 24);
    snapshot.resize(120, 40);
    expect(snapshot.cols).toBe(120);
    expect(snapshot.rows).toBe(40);

    // Write at row 35 (only visible in 40-row terminal, not 24-row)
    snapshot.write("\x1b[35;1Hresized_row_35");
    const serialized = await snapshot.getSnapshot();
    const lines = await readVisibleLines(serialized, 120, 40);
    snapshot.dispose();

    expect(lines[34]).toBe("resized_row_35");
  });

  it("returns empty snapshot after dispose", async () => {
    const snapshot = new ScreenSnapshot(80, 24);
    snapshot.write("hello");
    snapshot.dispose();
    expect(await snapshot.getSnapshot()).toBe("");
  });
});
