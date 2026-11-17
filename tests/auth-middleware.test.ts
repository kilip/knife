import { describe, expect, it } from "bun:test";
import type { Server } from "bun";
import { createApp } from "../server/app";
import type { KnifeConfig } from "../server/config";
import { handleTerminalUpgrade, type WsClientData } from "../server/features/terminal/ws";
import { isPublicRoute, PUBLIC_ROUTES } from "../server/middleware/require-auth";

function createTestConfig(overrides: Partial<KnifeConfig> = {}): KnifeConfig {
  return {
    host: "127.0.0.1",
    port: 3000,
    publicDomain: "knife.example.com",
    publicScheme: "https",
    trustedProxies: ["127.0.0.1"],
    theme: "catppuccin-mocha",
    sessionSecret: "auth-middleware-test-secret",
    auth: {
      githubClientId: "cid",
      githubClientSecret: "csec",
      allowedUsername: "testowner",
      allowedUserId: 1,
    },
    ...overrides,
  };
}

describe("Central Auth Middleware & Route Enumeration", () => {
  it("denies every non-public /api/* route in app.routes with 401 when unauthenticated", async () => {
    const config = createTestConfig();
    const app = createApp({
      getConfig: () => config,
      getIsFirstRun: () => false,
      setIsFirstRun: () => {},
      saveConfig: () => {},
    });

    const endpointRoutes = app.routes.filter(
      (r) => r.path !== "*" && !r.path.endsWith("/*") && r.path.startsWith("/api/"),
    );
    expect(endpointRoutes.length).toBeGreaterThan(0);

    for (const route of endpointRoutes) {
      const concretePath = route.path.replace(/:[^/]+/g, "test-id");
      if (isPublicRoute(concretePath)) {
        continue;
      }
      const method = route.method === "ALL" ? "GET" : route.method;
      const res = await app.request(concretePath, {
        method,
        headers: {
          Origin: "https://knife.example.com",
        },
      });
      expect(res.status).toBe(401);
    }
  });

  it("keeps PUBLIC_ROUTES reachable without a session cookie", async () => {
    const config = createTestConfig();
    const app = createApp({
      getConfig: () => config,
      getIsFirstRun: () => false,
      setIsFirstRun: () => {},
      saveConfig: () => {},
    });

    expect(PUBLIC_ROUTES).toContain("/health");
    expect(PUBLIC_ROUTES).toContain("/api/health");
    expect(PUBLIC_ROUTES).toContain("/api/config/public");

    for (const path of [
      "/health",
      "/api/health",
      "/api/config/public",
      "/auth/github",
      "/login",
      "/setup",
    ]) {
      const res = await app.request(path);
      expect(res.status).not.toBe(401);
    }
  });

  it("rejects unauthenticated (401) and cross-origin (403) WebSocket upgrades to /ws/terminal", () => {
    const config = createTestConfig();
    const mockServer = {
      requestIP: () => ({ address: "127.0.0.1" }),
      upgrade: () => true,
    } as unknown as Server<WsClientData>;

    const unauthReq = new Request("https://knife.example.com/ws/terminal?tabId=tab-1", {
      headers: { Origin: "https://knife.example.com" },
    });
    const unauthRes = handleTerminalUpgrade(unauthReq, mockServer, config);
    expect(unauthRes?.status).toBe(401);

    const crossOriginReq = new Request("https://knife.example.com/ws/terminal?tabId=tab-1", {
      headers: { Origin: "https://evil.example.com" },
    });
    const crossOriginRes = handleTerminalUpgrade(crossOriginReq, mockServer, config);
    expect(crossOriginRes?.status).toBe(403);
  });
});
