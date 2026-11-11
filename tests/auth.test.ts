import { describe, it, expect } from "bun:test";
import {
  generateSetupToken,
  getActiveSetupToken,
  verifySetupToken,
  consumeSetupToken,
  createSessionToken,
  verifySessionToken,
} from "../server/auth";

describe("Auth & Setup Token", () => {
  it("generates and verifies one-time setup token", () => {
    const token = generateSetupToken();
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(getActiveSetupToken()).toBe(token);

    // Verify valid token
    expect(verifySetupToken(token)).toBe(true);
    expect(verifySetupToken("wrong-token")).toBe(false);

    // Consume token (single use)
    const consumed = consumeSetupToken(token);
    expect(consumed).toBe(true);
    expect(getActiveSetupToken()).toBeNull();

    // Verify cannot be reused
    expect(verifySetupToken(token)).toBe(false);
  });

  it("creates and verifies HMAC SHA-256 session tokens", () => {
    const secret = "super-secret-key-12345";
    const token = createSessionToken("octocat", secret, 3600);

    const verified = verifySessionToken(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.username).toBe("octocat");

    // Fails with wrong secret
    expect(verifySessionToken(token, "wrong-secret")).toBeNull();

    // Fails with tampered token
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifySessionToken(tampered, secret)).toBeNull();
  });
});
