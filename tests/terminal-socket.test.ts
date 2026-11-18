import { describe, expect, it } from "bun:test";
import { getReconnectDelay } from "../app/features/terminal/useTerminalSocket";

describe("getReconnectDelay", () => {
  it("starts at 1000ms for the first attempt", () => {
    expect(getReconnectDelay(0)).toBe(1000);
  });

  it("grows exponentially by 1.5x per attempt", () => {
    expect(getReconnectDelay(1)).toBe(1500);
    expect(getReconnectDelay(2)).toBe(2250);
    expect(getReconnectDelay(3)).toBe(3375);
  });

  it("caps at 15000ms", () => {
    expect(getReconnectDelay(7)).toBe(15000);
    expect(getReconnectDelay(50)).toBe(15000);
  });

  it("resets to the initial delay when attempts reset to 0", () => {
    expect(getReconnectDelay(5)).toBeGreaterThan(getReconnectDelay(0));
    expect(getReconnectDelay(0)).toBe(1000);
  });
});
