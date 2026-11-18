import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createApp } from "../server/app";
import { createSessionToken } from "../server/auth";
import type { KnifeConfig } from "../server/config";
import type { TabData } from "../server/features/tabs/store";
import { createRateLimiter, RATE_LIMIT_WINDOW_MS } from "../server/middleware/rate-limit";

function createTestConfig(overrides: Partial<KnifeConfig> = {}): KnifeConfig {
  return {
    host: "127.0.0.1",
    port: 3000,
    publicDomain: "knife.example.com",
    publicScheme: "https",
    trustedProxies: ["10.0.0.1"],
    theme: "catppuccin-mocha",
    sessionSecret: "security-middleware-test-secret",
    auth: {
      githubClientId: "cid",
      githubClientSecret: "csec",
      allowedUsername: "testowner",
      allowedUserId: 1,
    },
    ...overrides,
  };
}

describe("Origin Check & Auth Rate Limiting", () => {
  it("enforces Origin on state-changing /api/* routes while allowing missing Origin and GET", async () => {
    const config = createTestConfig();
    let tabs: TabData[] = [{ id: "t1", name: "Shell 1", order: 0, createdAt: 100 }];
    const app = createApp({
      getConfig: () => config,
      getIsFirstRun: () => false,
      setIsFirstRun: () => {},
      saveConfig: () => {},
      getTabs: () => tabs,
      setTabs: (next) => {
        tabs = next;
      },
      persistTabs: () => {},
    });

    const token = createSessionToken("testowner", config.sessionSecret);
    const cookie = `knife_session=${token}`;

    // Mismatched Origin on POST /api/tabs -> 403
    const badOriginPost = await app.request("/api/tabs", {
      method: "POST",
      headers: {
        Origin: "https://evil.example.com",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Bad" }),
    });
    expect(badOriginPost.status).toBe(403);

    // Matching Origin on POST /api/tabs -> 201
    const okOriginPost = await app.request("/api/tabs", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Good" }),
    });
    expect(okOriginPost.status).toBe(201);

    // Missing Origin on POST /api/tabs -> 201
    const missingOriginPost = await app.request("/api/tabs", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "No Origin" }),
    });
    expect(missingOriginPost.status).toBe(201);

    // Mismatched Origin on GET /api/tabs is unaffected -> 200
    const badOriginGet = await app.request("/api/tabs", {
      method: "GET",
      headers: {
        Origin: "https://evil.example.com",
        Cookie: cookie,
      },
    });
    expect(badOriginGet.status).toBe(200);
  });

  it("rate limits /auth/github, /auth/github/callback, and /api/setup after 10 req/min and resets after 60s", async () => {
    let now = 1_000_000;
    const config = createTestConfig();
    const app = createApp({
      getConfig: () => config,
      getIsFirstRun: () => false,
      setIsFirstRun: () => {},
      saveConfig: () => {},
      now: () => now,
    });

    for (const path of ["/auth/github", "/auth/github/callback", "/api/setup"]) {
      const method = path === "/api/setup" ? "POST" : "GET";
      for (let i = 0; i < 10; i++) {
        const res = await app.request(path, {
          method,
          headers: { Origin: "https://knife.example.com" },
        });
        expect(res.status).not.toBe(429);
      }

      const eleventh = await app.request(path, {
        method,
        headers: { Origin: "https://knife.example.com" },
      });
      expect(eleventh.status).toBe(429);
      expect(Number(eleventh.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    }

    // Advance fake clock past 60s window
    now += RATE_LIMIT_WINDOW_MS + 1;

    for (const path of ["/auth/github", "/auth/github/callback", "/api/setup"]) {
      const method = path === "/api/setup" ? "POST" : "GET";
      const afterReset = await app.request(path, {
        method,
        headers: { Origin: "https://knife.example.com" },
      });
      expect(afterReset.status).not.toBe(429);
    }
  });

  it("keys rate limiting per IP and honors X-Forwarded-For ONLY for trustedProxies", async () => {
    const now = 2_000_000;
    const config = createTestConfig({ trustedProxies: ["10.0.0.1"] });
    const app = createApp({
      getConfig: () => config,
      getIsFirstRun: () => false,
      setIsFirstRun: () => {},
      saveConfig: () => {},
      now: () => now,
    });

    const trustedServer = { requestIP: () => ({ address: "10.0.0.1" }) };
    const untrustedServer = { requestIP: () => ({ address: "198.51.100.50" }) };

    // Exhaust limit for 203.0.113.10 via trusted proxy
    for (let i = 0; i < 10; i++) {
      const res = await app.fetch(
        new Request("https://knife.example.com/auth/github", {
          headers: { "X-Forwarded-For": "203.0.113.10" },
        }),
        { server: trustedServer },
      );
      expect(res.status).toBe(302);
    }
    const blockedA = await app.fetch(
      new Request("https://knife.example.com/auth/github", {
        headers: { "X-Forwarded-For": "203.0.113.10" },
      }),
      { server: trustedServer },
    );
    expect(blockedA.status).toBe(429);

    // Different forwarded IP via trusted proxy is not limited
    const allowedB = await app.fetch(
      new Request("https://knife.example.com/auth/github", {
        headers: { "X-Forwarded-For": "203.0.113.11" },
      }),
      { server: trustedServer },
    );
    expect(allowedB.status).toBe(302);

    // Untrusted proxy cannot spoof X-Forwarded-For to bypass its own IP limit
    for (let i = 0; i < 10; i++) {
      const res = await app.fetch(
        new Request("https://knife.example.com/auth/github", {
          headers: { "X-Forwarded-For": `203.0.113.${100 + i}` },
        }),
        { server: untrustedServer },
      );
      expect(res.status).toBe(302);
    }
    const blockedSpoof = await app.fetch(
      new Request("https://knife.example.com/auth/github", {
        headers: { "X-Forwarded-For": "203.0.113.200" },
      }),
      { server: untrustedServer },
    );
    expect(blockedSpoof.status).toBe(429);
  });

  it("evicts expired entries from the rate limiter store", async () => {
    let now = 5_000_000;
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 10_000, now: () => now });
    const app = new Hono<{ Variables: { clientIp: string } }>();
    app.use("*", async (c, next) => {
      c.set("clientIp", c.req.header("x-ip") || "127.0.0.1");
      await next();
    });
    app.get("/test", limiter.middleware, (c) => c.text("ok"));

    await app.request("/test", { headers: { "x-ip": "1.1.1.1" } });
    await app.request("/test", { headers: { "x-ip": "2.2.2.2" } });
    expect(limiter.store.size).toBe(2);

    now += 10_001;
    await app.request("/test", { headers: { "x-ip": "3.3.3.3" } });
    expect(limiter.store.size).toBe(1);
    expect(limiter.store.has("/test:1.1.1.1")).toBe(false);
    expect(limiter.store.has("/test:2.2.2.2")).toBe(false);
    expect(limiter.store.has("/test:3.3.3.3")).toBe(true);
  });
});
