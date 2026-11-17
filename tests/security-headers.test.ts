import { describe, expect, it } from "bun:test";
import type { KnifeConfig } from "../server/config";
import { getSecurityHeaders } from "../server/middleware/security-headers";

describe("Security Headers Middleware", () => {
  it("sets strict CSP with frame-ancestors 'none', X-Frame-Options: DENY, and nosniff", () => {
    const config = {
      host: "127.0.0.1",
      port: 3000,
      publicDomain: "knife.example.com",
      publicScheme: "https",
      trustedProxies: [],
      theme: "catppuccin-mocha",
      sessionSecret: "test-secret",
    } as KnifeConfig;

    const headers = getSecurityHeaders(config);
    const csp = headers.get("Content-Security-Policy");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("ws://knife.example.com wss://knife.example.com");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
