import { describe, expect, it } from "bun:test";
import type { KnifeConfig } from "../server/config";
import { getSecurityHeaders, injectScriptNonce } from "../server/middleware/security-headers";

describe("Security Headers Middleware", () => {
  const config = {
    host: "127.0.0.1",
    port: 3000,
    publicDomain: "knife.example.com",
    publicScheme: "https",
    trustedProxies: [],
    theme: "catppuccin-mocha",
    sessionSecret: "test-secret",
  } as KnifeConfig;

  it("sets strict CSP with frame-ancestors 'none', X-Frame-Options: DENY, and nosniff", () => {
    const headers = getSecurityHeaders(config);
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("ws://knife.example.com wss://knife.example.com");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("includes script nonce in CSP when provided", () => {
    const headers = getSecurityHeaders(config, { scriptNonce: "abc123==" });
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("script-src 'self' 'nonce-abc123=='");
  });

  it("injects nonce attribute onto all script tags without duplicating existing ones", () => {
    const html =
      '<html><head><script>a()</script><script type="module" async="">b()</script><script nonce="keep">c()</script></head></html>';
    const result = injectScriptNonce(html, "xyz789==");
    expect(result).toBe(
      '<html><head><script nonce="xyz789==">a()</script><script nonce="xyz789==" type="module" async="">b()</script><script nonce="keep">c()</script></head></html>',
    );
  });
});
