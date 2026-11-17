import { describe, expect, it } from "bun:test";
import { formatRequestLog, shouldLogRequest } from "../server/request-log";

describe("request-log", () => {
  describe("shouldLogRequest", () => {
    it("returns false for skipped static, PWA, icon, and health paths", () => {
      const skipped = [
        "/assets/app-123.js",
        "/assets/styles/main.css",
        "/icons/icon-192.png",
        "/icons/apple-touch-icon.png",
        "/sw.js",
        "/manifest.webmanifest",
        "/favicon.ico",
        "/health",
        "/api/health",
      ];

      for (const path of skipped) {
        expect(shouldLogRequest(path)).toBe(false);
      }
    });

    it("returns true for API and app routes", () => {
      expect(shouldLogRequest("/api/tabs")).toBe(true);
      expect(shouldLogRequest("/setup")).toBe(true);
      expect(shouldLogRequest("/")).toBe(true);
      expect(shouldLogRequest("/ws/terminal")).toBe(true);
    });
  });

  describe("formatRequestLog", () => {
    it("logs method, pathname, and client IP without query strings or tokens", () => {
      const line = formatRequestLog("GET", "/setup?token=abc123", "192.168.1.10");
      expect(line).toBe("[http] GET /setup (from: 192.168.1.10)");
      expect(line).not.toContain("abc123");
      expect(line).not.toContain("?");
    });
  });
});
