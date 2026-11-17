import type { KnifeConfig } from "../config";

/**
 * Builds standard security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy)
 * for HTTP responses.
 */
export function getSecurityHeaders(cfg: KnifeConfig): Headers {
  const headers = new Headers();
  const domain = cfg.publicDomain || `${cfg.host}:${cfg.port}`;
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ws://${domain} wss://${domain}`,
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
  ].join("; ");

  headers.set("Content-Security-Policy", csp);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return headers;
}
