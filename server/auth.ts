import { createHmac, timingSafeEqual } from "node:crypto";
import type { KnifeConfig } from "./config";

export interface SessionData {
  username: string;
  exp: number; // Unix timestamp in seconds
}

let activeSetupToken: string | null = null;

export function generateSetupToken(): string {
  activeSetupToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  return activeSetupToken;
}

export function getActiveSetupToken(): string | null {
  return activeSetupToken;
}

export function verifySetupToken(token: string): boolean {
  if (!activeSetupToken || !token) return false;
  try {
    const a = Buffer.from(activeSetupToken);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function consumeSetupToken(token: string): boolean {
  if (verifySetupToken(token)) {
    activeSetupToken = null;
    return true;
  }
  return false;
}

/**
 * Sign session data: payloadBase64.signatureHex
 */
export function createSessionToken(
  username: string,
  secret: string,
  maxAgeSeconds: number = 30 * 24 * 3600,
): string {
  const payload: SessionData = {
    username,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const jsonStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(jsonStr).toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadBase64).digest("hex");
  return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionData | null {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadBase64, providedSig] = parts;

  try {
    const expectedSig = createHmac("sha256", secret).update(payloadBase64).digest("hex");
    const sigA = Buffer.from(expectedSig);
    const sigB = Buffer.from(providedSig);
    if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
      return null;
    }

    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const session: SessionData = JSON.parse(payloadJson);

    if (typeof session.exp !== "number" || Math.floor(Date.now() / 1000) > session.exp) {
      return null; // Expired
    }

    return session;
  } catch {
    return null;
  }
}

export function getSessionFromCookie(
  cookieHeader: string | null,
  secret: string,
): SessionData | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const prefix = "knife_session=";
  for (const c of cookies) {
    if (c.startsWith(prefix)) {
      const token = c.slice(prefix.length);
      return verifySessionToken(token, secret);
    }
  }
  return null;
}

export function createSessionCookieHeader(
  token: string,
  config: KnifeConfig,
  clear: boolean = false,
): string {
  const isSecure = config.publicScheme === "https";
  if (clear) {
    return `knife_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isSecure ? "; Secure" : ""}`;
  }
  const maxAge = 30 * 24 * 3600;
  return `knife_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isSecure ? "; Secure" : ""}`;
}

export function getPublicOrigin(config: KnifeConfig): string {
  const domain = config.publicDomain || `${config.host}:${config.port}`;
  const scheme = config.publicScheme || "http";
  return `${scheme}://${domain}`;
}

export function getGitHubOAuthUrl(config: KnifeConfig, state: string): string {
  if (!config.auth) {
    throw new Error("GitHub auth not configured");
  }
  const callbackUrl = `${getPublicOrigin(config)}/auth/github/callback`;
  const params = new URLSearchParams({
    client_id: config.auth.githubClientId,
    redirect_uri: callbackUrl,
    scope: "read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(
  config: KnifeConfig,
  code: string,
): Promise<{ accessToken: string } | null> {
  if (!config.auth) return null;
  const callbackUrl = `${getPublicOrigin(config)}/auth/github/callback`;
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Knife-Terminal",
    },
    body: JSON.stringify({
      client_id: config.auth.githubClientId,
      client_secret: config.auth.githubClientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });

  if (!res.ok) {
    console.error("GitHub access_token exchange failed:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    console.error("GitHub access_token response error:", data);
    return null;
  }

  return { accessToken: data.access_token };
}

export async function fetchGitHubUser(
  accessToken: string,
): Promise<{ login: string; name?: string; avatarUrl?: string } | null> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "Knife-Terminal",
    },
  });

  if (!res.ok) {
    console.error("Failed to fetch GitHub user:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { login: string; name?: string; avatar_url?: string };
  return {
    login: data.login,
    name: data.name,
    avatarUrl: data.avatar_url,
  };
}
