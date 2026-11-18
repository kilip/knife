import type { KnifeConfig } from "../config";

export interface SecurityHeadersOptions {
  scriptNonce?: string;
}

/**
 * Builds standard security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy)
 * for HTTP responses.
 */
export function getSecurityHeaders(cfg: KnifeConfig, options?: SecurityHeadersOptions): Headers {
  const headers = new Headers();
  const domain = cfg.publicDomain || `${cfg.host}:${cfg.port}`;
  const scriptSrc = options?.scriptNonce
    ? `script-src 'self' 'nonce-${options.scriptNonce}'`
    : "script-src 'self'";
  const csp = [
    "default-src 'self'",
    scriptSrc,
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

/**
 * Adds a CSP `nonce` attribute to every `<script>` tag that does not already have one.
 */
export function injectScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script\b(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
}
