import type { MiddlewareHandler } from "hono";
import type { KnifeConfig } from "../config";
import { isAllowedRequestOrigin } from "../features/terminal/ws";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Enforces Origin and Sec-Fetch-Site validation on state-changing `/api/*` requests.
 * Missing Origin (with no cross-site Sec-Fetch-Site) and GET/HEAD/OPTIONS are allowed.
 */
export function requireOrigin(getConfig: () => KnifeConfig): MiddlewareHandler {
  return async (c, next) => {
    if (STATE_CHANGING_METHODS.has(c.req.method)) {
      const cfg = getConfig();
      if (!isAllowedRequestOrigin(c.req.raw.headers, cfg.publicDomain, cfg.host, cfg.port)) {
        const clientIp = c.get("clientIp") as string;
        console.warn(
          `[api] Forbidden origin '${c.req.header("origin") ?? null}' (Sec-Fetch-Site: '${c.req.header("sec-fetch-site") ?? null}') for ${c.req.method} ${c.req.path} from ${clientIp}`,
        );
        return c.json({ error: "Forbidden origin" }, 403);
      }
    }
    await next();
  };
}
