import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  checkTmuxInstalled,
  createSession,
  killSession,
  hasSession,
  reconcileSessions,
} from "../server/tmux";
import type { TabData } from "../server/storage";

describe("Tmux Subsystem & Session Reconciliation", () => {
  beforeAll(() => {
    checkTmuxInstalled();
  });

  const testSessionA = "knife-test-unit-a";
  const testSessionB = "knife-test-unit-b";

  afterAll(() => {
    killSession(testSessionA);
    killSession(testSessionB);
  });

  it("creates and kills sessions on dedicated socket", () => {
    killSession(testSessionA);
    expect(hasSession(testSessionA)).toBe(false);

    createSession(testSessionA, 80, 24);
    expect(hasSession(testSessionA)).toBe(true);

    killSession(testSessionA);
    expect(hasSession(testSessionA)).toBe(false);
  });

  it("reconciles sessions: drops dead ones and keeps live ones", () => {
    createSession(testSessionA, 80, 24);

    const savedTabs: TabData[] = [
      {
        id: "tab-live",
        name: "Live Shell",
        sessionName: testSessionA,
        order: 0,
        createdAt: 1000,
      },
      {
        id: "tab-dead",
        name: "Dead Shell",
        sessionName: "knife-nonexistent-dead-session",
        order: 1,
        createdAt: 1001,
      },
    ];

    const reconciled = reconcileSessions(savedTabs);

    // Live tab kept
    expect(reconciled.some((t) => t.id === "tab-live")).toBe(true);
    // Dead tab dropped
    expect(reconciled.some((t) => t.id === "tab-dead")).toBe(false);

    killSession(testSessionA);
  });

  it("re-adopts orphaned knife-* sessions found in tmux", () => {
    createSession(testSessionB, 80, 24);

    // Empty saved tabs list
    const reconciled = reconcileSessions([]);

    expect(reconciled.some((t) => t.sessionName === testSessionB)).toBe(true);

    killSession(testSessionB);
  });
});
