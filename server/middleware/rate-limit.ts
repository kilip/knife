import type { MiddlewareHandler } from "hono";

export const RATE_LIMIT_MAX_REQUESTS = 10;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  now?: () => number;
}

/**
 * Creates an in-memory fixed-window rate limiter middleware keyed by route path + client IP.
 * Evicts expired entries on each request to keep memory bounded.
 */
export function createRateLimiter(options: RateLimiterOptions = {}) {
  const maxRequests = options.maxRequests ?? RATE_LIMIT_MAX_REQUESTS;
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const now = options.now ?? Date.now;
  const store = new Map<string, RateLimitEntry>();

  function evictExpired(currentTime: number): void {
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= currentTime) {
        store.delete(key);
      }
    }
  }

  const middleware: MiddlewareHandler = async (c, next) => {
    const currentTime = now();
    evictExpired(currentTime);

    const clientIp = (c.get("clientIp") as string | undefined) || "127.0.0.1";
    const key = `${c.req.path}:${clientIp}`;
    const existing = store.get(key);

    if (!existing) {
      store.set(key, { count: 1, resetAt: currentTime + windowMs });
      await next();
      return;
    }

    if (existing.count >= maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many requests" }, 429);
    }

    existing.count += 1;
    await next();
  };

  return { middleware, store, evictExpired };
}
