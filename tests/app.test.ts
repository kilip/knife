import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "../server/app";
import { createSessionToken, generateSetupToken, verifySetupToken } from "../server/auth";
import type { KnifeConfig } from "../server/config";

function createTestConfig(overrides: Partial<KnifeConfig> = {}): KnifeConfig {
  return {
    host: "127.0.0.1",
    port: 3000,
    publicDomain: "knife.example.com",
    publicScheme: "https",
    trustedProxies: ["127.0.0.1"],
    theme: "catppuccin-mocha",
    sessionSecret: "test-app-session-secret",
    auth: {
      githubClientId: "client-id",
      githubClientSecret: "client-secret",
      allowedUsername: "testowner",
      allowedUserId: 12345,
    },
    ...overrides,
  };
}

describe("Hono App Routes", () => {
  let config: KnifeConfig;
  let isFirstRun: boolean;
  let savedConfigs: KnifeConfig[];

  beforeEach(() => {
    config = createTestConfig();
    isFirstRun = false;
    savedConfigs = [];
  });

  afterEach(() => {
    savedConfigs = [];
  });

  function makeApp() {
    return createApp({
      getConfig: () => config,
      getIsFirstRun: () => isFirstRun,
      setIsFirstRun: (val) => {
        isFirstRun = val;
      },
      saveConfig: (cfg) => {
        savedConfigs.push(structuredClone(cfg));
      },
    });
  }

  it("serves /health and /api/health with security headers", async () => {
    const app = makeApp();
    for (const path of ["/health", "/api/health"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: "ok" });
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
    }
  });

  it("serves /api/config/public with public fields only", async () => {
    const app = makeApp();
    const res = await app.request("/api/config/public");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      publicDomain: "knife.example.com",
      publicScheme: "https",
      theme: "catppuccin-mocha",
      callbackUrl: "https://knife.example.com/auth/github/callback",
    });
  });

  it("enforces method, content-type, token, and saves config on /api/setup", async () => {
    isFirstRun = true;
    config = createTestConfig({ publicDomain: "", auth: undefined });
    const token = generateSetupToken();
    const app = makeApp();

    const getRes = await app.request("/api/setup", { method: "GET" });
    expect(getRes.status).toBe(405);

    const badTypeRes = await app.request("/api/setup", {
      method: "POST",
      headers: { Origin: "https://127.0.0.1:3000" },
      body: "plain",
    });
    expect(badTypeRes.status).toBe(415);

    const badTokenRes = await app.request("/api/setup", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: "wrong" }),
    });
    expect(badTokenRes.status).toBe(403);

    const okRes = await app.request("/api/setup", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token,
        publicDomain: "https://terminal.example.com/",
        publicScheme: "https",
        githubClientId: "gh-id",
        githubClientSecret: "gh-secret",
        allowedUsername: "alice",
        allowedUserId: 99,
      }),
    });
    expect(okRes.status).toBe(200);
    expect(await okRes.json()).toEqual({ success: true, redirect: "/login" });
    expect(isFirstRun).toBe(false);
    expect(savedConfigs).toHaveLength(1);
    expect(config.publicDomain).toBe("terminal.example.com");
    expect(config.auth?.allowedUsername).toBe("alice");
    expect(verifySetupToken(token)).toBe(false);
  });

  it("handles /auth/github, /auth/github/callback, and /auth/logout", async () => {
    const app = makeApp();

    isFirstRun = true;
    const firstRunRes = await app.request("/auth/github");
    expect(firstRunRes.status).toBe(302);
    expect(firstRunRes.headers.get("Location")).toBe("/setup");

    isFirstRun = false;
    const oauthRes = await app.request("/auth/github");
    expect(oauthRes.status).toBe(302);
    expect(oauthRes.headers.get("Location")).toContain("github.com/login/oauth/authorize");
    expect(oauthRes.headers.get("Set-Cookie")).toContain("knife_oauth_state=");

    const badCallbackRes = await app.request("/auth/github/callback?state=abc&code=123");
    expect(badCallbackRes.status).toBe(400);

    const missingCodeRes = await app.request("/auth/github/callback?state=xyz", {
      headers: { Cookie: "knife_oauth_state=xyz" },
    });
    expect(missingCodeRes.status).toBe(400);

    const logoutRes = await app.request("/auth/logout");
    expect(logoutRes.status).toBe(302);
    expect(logoutRes.headers.get("Location")).toBe("/login");
    expect(logoutRes.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("handles /api/me for unauthenticated and authenticated requests", async () => {
    const app = makeApp();

    const unauthRes = await app.request("/api/me");
    expect(unauthRes.status).toBe(401);
    expect(await unauthRes.json()).toEqual({ authenticated: false });

    const token = createSessionToken("testowner", config.sessionSecret);
    const authRes = await app.request("/api/me", {
      headers: { Cookie: `knife_session=${token}` },
    });
    expect(authRes.status).toBe(200);
    const body = (await authRes.json()) as Record<string, unknown>;
    expect(body.authenticated).toBe(true);
    expect(body.username).toBe("testowner");
    expect(body.theme).toBe("catppuccin-mocha");
  });

  it("handles /api/theme GET and POST validation", async () => {
    const app = makeApp();
    const token = createSessionToken("testowner", config.sessionSecret);

    const getRes = await app.request("/api/theme");
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toEqual({ theme: "catppuccin-mocha" });

    const unauthPost = await app.request("/api/theme", {
      method: "POST",
      headers: { Origin: "https://knife.example.com", "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "nord" }),
    });
    expect(unauthPost.status).toBe(401);

    const invalidPost = await app.request("/api/theme", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: `knife_session=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme: "invalid-theme" }),
    });
    expect(invalidPost.status).toBe(400);

    const validPost = await app.request("/api/theme", {
      method: "POST",
      headers: {
        Origin: "https://knife.example.com",
        Cookie: `knife_session=${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ theme: "nord" }),
    });
    expect(validPost.status).toBe(200);
    expect(await validPost.json()).toEqual({ theme: "nord" });
    expect(config.theme).toBe("nord");
    expect(savedConfigs).toHaveLength(1);
  });

  it("handles /setup, /login, and static/SPA redirects", async () => {
    const app = makeApp();

    isFirstRun = true;
    const firstRunRoot = await app.request("/");
    expect(firstRunRoot.status).toBe(302);
    expect(firstRunRoot.headers.get("Location")).toBe("/setup");

    isFirstRun = false;
    const setupRedirect = await app.request("/setup");
    expect(setupRedirect.status).toBe(302);
    expect(setupRedirect.headers.get("Location")).toBe("/");

    const unauthRoot = await app.request("/");
    expect(unauthRoot.status).toBe(302);
    expect(unauthRoot.headers.get("Location")).toBe("/login");

    const token = createSessionToken("testowner", config.sessionSecret);
    const authLogin = await app.request("/login", {
      headers: { Cookie: `knife_session=${token}` },
    });
    expect(authLogin.status).toBe(302);
    expect(authLogin.headers.get("Location")).toBe("/");

    const manifestRes = await app.request("/manifest.webmanifest");
    expect(manifestRes.status).toBe(200);
    expect(manifestRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
