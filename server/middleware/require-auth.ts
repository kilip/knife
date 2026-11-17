import type { MiddlewareHandler } from "hono";
import { getSessionFromCookie, type SessionData } from "../auth";
import type { KnifeConfig } from "../config";

export const PUBLIC_ROUTES = [
  "/health",
  "/api/health",
  "/api/config/public",
  "/api/setup",
  "/auth/*",
  "/login",
  "/setup",
] as const;

export function isPublicRoute(path: string): boolean {
  for (const route of PUBLIC_ROUTES) {
    if (route.endsWith("/*")) {
      const prefix = route.slice(0, -1);
      if (path.startsWith(prefix)) return true;
    } else if (path === route) {
      return true;
    }
  }
  return false;
}

/**
 * Parses the session cookie once per request and stores it on Hono context.
 */
export function attachSession(getConfig: () => KnifeConfig): MiddlewareHandler {
  return async (c, next) => {
    const cfg = getConfig();
    const session = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);
    c.set("session", session);
    await next();
  };
}

/**
 * Default-deny auth middleware for `/api/*` routes not listed in `PUBLIC_ROUTES`.
 */
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    if (isPublicRoute(c.req.path)) {
      await next();
      return;
    }
    const session = c.get("session") as SessionData | null | undefined;
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}
