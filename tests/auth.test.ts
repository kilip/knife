import { describe, expect, it } from "bun:test";
import {
  authorizeGitHubUser,
  consumeSetupToken,
  createSessionToken,
  generateSetupToken,
  getActiveSetupToken,
  revokeSession,
  verifySessionToken,
  verifySetupToken,
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
    expect(typeof verified?.sid).toBe("string");
    expect(verified?.sid.length).toBeGreaterThan(0);
    expect(typeof verified?.iat).toBe("number");

    // Fails with wrong secret
    expect(verifySessionToken(token, "wrong-secret")).toBeNull();

    // Fails with tampered token
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifySessionToken(tampered, secret)).toBeNull();

    // Fails after session revocation
    revokeSession(verified!.sid);
    expect(verifySessionToken(token, secret)).toBeNull();
  });

  it("authorizes GitHub user by numeric allowedUserId and rejects matching login with wrong id", () => {
    const authConfig = {
      githubClientId: "cid",
      githubClientSecret: "csecret",
      allowedUsername: "octocat",
      allowedUserId: 12345,
    };

    // Matching login but non-matching numeric ID must be rejected
    const wrongIdResult = authorizeGitHubUser({ id: 99999, login: "octocat" }, authConfig);
    expect(wrongIdResult.authorized).toBe(false);

    // Matching numeric ID is authorized
    const okResult = authorizeGitHubUser({ id: 12345, login: "renamed-octocat" }, authConfig);
    expect(okResult).toEqual({ authorized: true });
  });

  it("pins allowedUserId on first valid login for legacy allowedUsername-only config", () => {
    const legacyConfig = {
      githubClientId: "cid",
      githubClientSecret: "csecret",
      allowedUsername: "octocat",
    };

    const mismatch = authorizeGitHubUser({ id: 777, login: "someone-else" }, legacyConfig);
    expect(mismatch.authorized).toBe(false);

    const match = authorizeGitHubUser({ id: 4242, login: "OctoCat" }, legacyConfig);
    expect(match).toEqual({ authorized: true, pinUserId: 4242 });
  });
});
