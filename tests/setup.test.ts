import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import Setup, { extractSetupTokenFromHash } from "../app/routes/setup";

describe("Setup UI Token Handling", () => {
  it("extracts token from URL fragment (#token=...)", () => {
    expect(extractSetupTokenFromHash("#token=abc123xyz")).toBe("abc123xyz");
    expect(extractSetupTokenFromHash("#foo=bar&token=secret-tok-99&baz=1")).toBe("secret-tok-99");
  });

  it("returns null when fragment has no non-empty token", () => {
    expect(extractSetupTokenFromHash("")).toBeNull();
    expect(extractSetupTokenFromHash("#")).toBeNull();
    expect(extractSetupTokenFromHash("#other=value")).toBeNull();
    expect(extractSetupTokenFromHash("#token=")).toBeNull();
  });

  it("renders the setup token input field for manual entry or editing", () => {
    const html = renderToString(React.createElement(Setup));
    expect(html).toContain('id="setup-token"');
    expect(html).toContain("One-Time Setup Token");
  });

  it("reads token from location.hash, clears history with replaceState, and submits via POST /api/setup body", () => {
    const src = readFileSync(join(process.cwd(), "app/routes/setup.tsx"), "utf8");
    expect(src).toContain("extractSetupTokenFromHash(window.location.hash)");
    expect(src).toContain("window.history.replaceState(");
    expect(src).not.toContain('new URLSearchParams(window.location.search).get("token")');
    expect(src).toContain('fetch("/api/setup"');
    expect(src).toContain('method: "POST"');
  });
});
