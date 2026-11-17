import { Hono } from "hono";
import { THEME_MAP } from "../app/utils/themes";
import {
  authorizeGitHubUser,
  consumeSetupToken,
  createSessionCookieHeader,
  createSessionToken,
  exchangeGitHubCode,
  fetchGitHubUser,
  getActiveSetupToken,
  getGitHubOAuthUrl,
  getPublicOrigin,
  getSessionFromCookie,
  revokeSession,
  verifySetupToken,
} from "./auth";
import type { KnifeConfig } from "./config";
import { createFsRoutes } from "./features/fs/routes";
import { serveStaticFile } from "./features/static/serve";
import { createTabsRoutes } from "./features/tabs/routes";
import { loadSettings, saveSettings, type TabData } from "./features/tabs/store";
import { getShellName, getUserShell } from "./features/terminal/shell";
import { isAllowedRequestOrigin } from "./features/terminal/ws";
import { createUpdateRoutes } from "./features/update/routes";
import { formatRequestLog, shouldLogRequest } from "./middleware/request-log";
import { getSecurityHeaders } from "./middleware/security-headers";
import { getClientIp } from "./proxy";

export interface AppBindings {
  server?: {
    requestIP?: (req: Request) => { address?: string } | null;
  };
}

export interface AppVariables {
  clientIp: string;
}

export interface AppDeps {
  getConfig: () => KnifeConfig;
  getIsFirstRun: () => boolean;
  setIsFirstRun: (value: boolean) => void;
  saveConfig: (config: KnifeConfig) => void;
  getTabs?: () => TabData[];
  setTabs?: (tabs: TabData[]) => void;
  persistTabs?: (tabs: TabData[]) => void;
}

function requireJsonContentType(req: Request, headers: HeadersInit): Response | null {
  const contentType = req.headers.get("content-type");
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return Response.json(
      { error: "Content-Type must be application/json" },
      { status: 415, headers },
    );
  }
  return null;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<{ Bindings: AppBindings; Variables: AppVariables }>();

  // Request logging + security headers on every response
  app.use("*", async (c, next) => {
    const cfg = deps.getConfig();
    const url = new URL(c.req.url);
    const directIp = c.env?.server?.requestIP?.(c.req.raw)?.address || "127.0.0.1";
    const clientIp = getClientIp(directIp, c.req.raw.headers, cfg.trustedProxies);
    c.set("clientIp", clientIp);

    if (shouldLogRequest(url.pathname)) {
      console.log(formatRequestLog(c.req.method, url.pathname, clientIp));
    }

    await next();

    const secHeaders = getSecurityHeaders(deps.getConfig());
    const headers = new Headers(c.res.headers);
    secHeaders.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    });
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  });

  // Health check endpoints
  app.all("/health", (c) => c.json({ status: "ok" }));
  app.all("/api/health", (c) => c.json({ status: "ok" }));

  // Public config endpoint
  app.all("/api/config/public", (c) => {
    const cfg = deps.getConfig();
    return c.json({
      publicDomain: cfg.publicDomain,
      publicScheme: cfg.publicScheme,
      theme: cfg.theme,
      callbackUrl: cfg.publicDomain
        ? `${getPublicOrigin(cfg)}/auth/github/callback`
        : "https://<your-public-domain>/auth/github/callback",
    });
  });

  // Enforce Origin / Sec-Fetch-Site on all non-GET /api/* requests
  app.use("/api/*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.method !== "OPTIONS") {
      const cfg = deps.getConfig();
      if (!isAllowedRequestOrigin(c.req.raw.headers, cfg.publicDomain, cfg.host, cfg.port)) {
        const url = new URL(c.req.url);
        const clientIp = c.get("clientIp");
        console.warn(
          `[api] Forbidden origin '${c.req.header("origin") ?? null}' (Sec-Fetch-Site: '${c.req.header("sec-fetch-site") ?? null}') for ${c.req.method} ${url.pathname} from ${clientIp}`,
        );
        return c.json({ error: "Forbidden origin" }, 403);
      }
    }
    await next();
  });

  // First-run setup API
  app.post("/api/setup", async (c) => {
    const cfg = deps.getConfig();
    const secHeaders = getSecurityHeaders(cfg);
    const contentTypeErr = requireJsonContentType(c.req.raw, secHeaders);
    if (contentTypeErr) return contentTypeErr;

    const clientIp = c.get("clientIp");

    try {
      const body = (await c.req.json()) as {
        token?: string;
        publicDomain?: string;
        publicScheme?: "http" | "https";
        githubClientId?: string;
        githubClientSecret?: string;
        allowedUsername?: string;
        allowedUserId?: number;
        theme?: string;
        trustedProxies?: string[];
      };
      console.log(
        `[setup] Received setup attempt: user=${body.allowedUsername}, domain=${body.publicDomain}`,
      );

      if (!deps.getIsFirstRun() && !getActiveSetupToken()) {
        return c.json({ error: "Setup has already been completed." }, 400);
      }

      if (!body.token || !verifySetupToken(body.token)) {
        console.warn(`[setup] Token verification failed from ${clientIp}`);
        return c.json({ error: "Invalid or expired setup token." }, 403);
      }

      if (!body.publicDomain || typeof body.publicDomain !== "string") {
        return c.json({ error: "Public domain is required (e.g. knife.example.com)." }, 400);
      }

      if (!body.githubClientId || !body.githubClientSecret) {
        return c.json({ error: "GitHub Client ID and Client Secret are required." }, 400);
      }

      if (!body.allowedUsername || typeof body.allowedUsername !== "string") {
        return c.json({ error: "Allowed GitHub username is required." }, 400);
      }

      if (
        body.allowedUserId !== undefined &&
        (typeof body.allowedUserId !== "number" ||
          !Number.isInteger(body.allowedUserId) ||
          body.allowedUserId <= 0)
      ) {
        return c.json({ error: "Allowed GitHub user ID must be a positive integer." }, 400);
      }

      const cleanDomain = body.publicDomain
        .trim()
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "");

      cfg.publicDomain = cleanDomain;
      cfg.publicScheme = body.publicScheme === "http" ? "http" : "https";
      if (body.theme) cfg.theme = body.theme;
      if (body.trustedProxies && Array.isArray(body.trustedProxies)) {
        cfg.trustedProxies = body.trustedProxies;
      }

      cfg.auth = {
        githubClientId: body.githubClientId.trim(),
        githubClientSecret: body.githubClientSecret.trim(),
        allowedUsername: body.allowedUsername.trim(),
        ...(body.allowedUserId !== undefined ? { allowedUserId: body.allowedUserId } : {}),
      };

      deps.saveConfig(cfg);
      consumeSetupToken(body.token);
      deps.setIsFirstRun(false);

      console.log(`[setup] Setup successfully completed by user '${cfg.auth.allowedUsername}'!`);

      return c.json({ success: true, redirect: "/login" });
    } catch (err) {
      console.error("[setup] Error processing setup:", err);
      return c.json({ error: "Failed to process setup request." }, 500);
    }
  });

  app.all("/api/setup", (c) => c.text("Method Not Allowed", 405));

  // GitHub OAuth routes
  app.all("/auth/github", (c) => {
    const cfg = deps.getConfig();
    if (deps.getIsFirstRun() || !cfg.auth) {
      return c.redirect("/setup", 302);
    }
    const state = crypto.randomUUID();
    const authUrl = getGitHubOAuthUrl(cfg, state);
    const isSecure = cfg.publicScheme === "https";
    c.header(
      "Set-Cookie",
      `knife_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isSecure ? "; Secure" : ""}`,
    );
    return c.redirect(authUrl, 302);
  });

  app.all("/auth/github/callback", async (c) => {
    const cfg = deps.getConfig();
    const url = new URL(c.req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieHeader = c.req.header("cookie") || "";

    const stateCookie = cookieHeader
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("knife_oauth_state="))
      ?.split("=")[1];

    if (!state || !stateCookie || state !== stateCookie) {
      return c.text("Invalid or expired OAuth state parameter. Please try again.", 400);
    }

    if (!code) {
      return c.text("Missing OAuth code parameter from GitHub.", 400);
    }

    const tokenResult = await exchangeGitHubCode(cfg, code);
    if (!tokenResult) {
      return c.text("Failed to exchange GitHub authorization code.", 500);
    }

    const user = await fetchGitHubUser(tokenResult.accessToken);
    if (!user) {
      return c.text("Failed to fetch GitHub user profile.", 500);
    }

    const authResult = authorizeGitHubUser(user, cfg.auth);
    if (!authResult.authorized) {
      console.warn(`[auth] Unauthorized login attempt: ${authResult.reason}`);
      return c.text(
        `Access Denied: GitHub user '${user.login}' is not authorized to access this knife instance.`,
        403,
      );
    }

    if (authResult.pinUserId !== undefined && cfg.auth) {
      cfg.auth.allowedUserId = authResult.pinUserId;
      deps.saveConfig(cfg);
    }

    const sessionToken = createSessionToken(user.login, cfg.sessionSecret);
    const cookieVal = createSessionCookieHeader(sessionToken, cfg);

    c.header("Set-Cookie", cookieVal);
    return c.redirect("/", 302);
  });

  app.all("/auth/logout", (c) => {
    const cfg = deps.getConfig();
    const logoutSession = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);
    if (logoutSession) {
      revokeSession(logoutSession.sid);
    }
    c.header("Set-Cookie", createSessionCookieHeader("", cfg, true));
    return c.redirect("/login", 302);
  });

  // User profile endpoint
  app.all("/api/me", (c) => {
    const cfg = deps.getConfig();
    const currentSession = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);
    if (!currentSession) {
      return c.json({ authenticated: false }, 401);
    }
    return c.json({
      authenticated: true,
      username: currentSession.username,
      theme: cfg.theme,
      shell: getUserShell(),
      shellName: getShellName(),
    });
  });

  // Theme preference endpoint
  app.all("/api/theme", async (c) => {
    const cfg = deps.getConfig();
    const secHeaders = getSecurityHeaders(cfg);
    if (c.req.method === "POST") {
      const currentSession = getSessionFromCookie(
        c.req.header("cookie") ?? null,
        cfg.sessionSecret,
      );
      if (!currentSession) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const contentTypeErr = requireJsonContentType(c.req.raw, secHeaders);
      if (contentTypeErr) return contentTypeErr;
      const body = (await c.req.json().catch(() => ({}))) as { theme?: unknown };
      if (typeof body?.theme !== "string" || !THEME_MAP.has(body.theme)) {
        return c.json({ error: "Invalid theme" }, 400);
      }
      cfg.theme = body.theme;
      deps.saveConfig(cfg);
      return c.json({ theme: cfg.theme });
    }
    return c.json({ theme: cfg.theme });
  });

  // Feature routes: tabs, fs, settings, update
  let fallbackTabs: TabData[] = [];
  const getTabs = deps.getTabs ?? (() => fallbackTabs);
  const setTabs =
    deps.setTabs ??
    ((tabs: TabData[]) => {
      fallbackTabs = tabs;
    });

  app.route(
    "/api/tabs",
    createTabsRoutes({
      getConfig: deps.getConfig,
      getTabs,
      setTabs,
      persistTabs: deps.persistTabs,
    }),
  );

  app.route("/api/fs", createFsRoutes({ getConfig: deps.getConfig }));

  app.all("/api/settings", async (c) => {
    const cfg = deps.getConfig();
    const secHeaders = getSecurityHeaders(cfg);
    const currentSession = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);
    if (!currentSession) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (c.req.method === "GET") {
      return c.json(loadSettings(cfg.theme));
    }
    if (c.req.method === "PATCH") {
      const contentTypeErr = requireJsonContentType(c.req.raw, secHeaders);
      if (contentTypeErr) return contentTypeErr;
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return c.json({ error: "Invalid JSON body" }, 400);
      }
      if (typeof body.theme === "string" && body.theme.length > 0) {
        cfg.theme = body.theme;
        deps.saveConfig(cfg);
      }
      return c.json(saveSettings(body, cfg.theme));
    }
    return c.text("Method Not Allowed", 405);
  });

  app.route(
    "/api/system/update",
    createUpdateRoutes({
      getConfig: deps.getConfig,
      getTabsCount: () => getTabs().length,
    }),
  );

  // Static assets + SPA fallback
  app.all("*", async (c) => {
    const cfg = deps.getConfig();
    const secHeaders = getSecurityHeaders(cfg);
    const reqPath = c.req.path;

    const staticFile = serveStaticFile(reqPath, undefined, secHeaders);
    if (staticFile) {
      return staticFile;
    }

    const currentSession = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);

    if (deps.getIsFirstRun()) {
      if (!reqPath.startsWith("/setup")) {
        return c.redirect("/setup", 302);
      }
    } else {
      if (reqPath === "/setup") {
        return c.redirect("/", 302);
      }
      if (!currentSession && reqPath !== "/login") {
        return c.redirect("/login", 302);
      }
      if (currentSession && reqPath === "/login") {
        return c.redirect("/", 302);
      }
    }

    const indexHtml = serveStaticFile("/index.html", "text/html; charset=utf-8");
    if (indexHtml) {
      const text = await indexHtml.text();
      const headers = new Headers(secHeaders);
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      return new Response(text, { headers });
    }

    return c.text("Application not built. Please run 'bun run build'.", 503);
  });

  return app;
}
