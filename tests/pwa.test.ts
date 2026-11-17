import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

describe("PWA Specification & Assets", () => {
  const rootDir = process.cwd();

  it("manifest.webmanifest is valid JSON and includes required PWA fields", () => {
    const manifestPath = join(rootDir, "public", "manifest.webmanifest");
    expect(existsSync(manifestPath)).toBe(true);

    const content = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(content.name).toBe("Knife — Web Terminal");
    expect(content.short_name).toBe("Knife");
    expect(content.start_url).toBe("/");
    expect(content.display).toBe("standalone");
    expect(content.theme_color).toBe("#1e1e2e");
    expect(content.background_color).toBe("#1e1e2e");
    expect(Array.isArray(content.icons)).toBe(true);
    expect(content.icons.length).toBeGreaterThanOrEqual(4);

    const has192 = content.icons.some((i: { sizes: string }) => i.sizes === "192x192");
    const has512 = content.icons.some((i: { sizes: string }) => i.sizes === "512x512");
    const hasMaskable = content.icons.some((i: { purpose?: string }) => i.purpose === "maskable");

    expect(has192).toBe(true);
    expect(has512).toBe(true);
    expect(hasMaskable).toBe(true);
  });

  it("all defined icons exist with non-zero size", () => {
    const iconFiles = [
      "icon-192.png",
      "icon-512.png",
      "icon-maskable-192.png",
      "icon-maskable-512.png",
      "apple-touch-icon.png",
      "icon.svg",
    ];

    for (const file of iconFiles) {
      const p = join(rootDir, "public", "icons", file);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(0);
    }
  });

  it("sw.ts exists and declares Serwist configuration", () => {
    const swPath = join(rootDir, "app", "sw.ts");
    expect(existsSync(swPath)).toBe(true);
    const content = readFileSync(swPath, "utf-8");
    expect(content).toContain("new Serwist");
    expect(content).toContain("self.__SW_MANIFEST");
    expect(content).toContain("skipWaiting: false");
    expect(content).toContain('navigateFallback: "/index.html"');
    expect(content).toContain(
      "navigateFallbackDenylist: [/^\\/api\\//, /^\\/ws\\//, /^\\/auth\\//]",
    );
  });

  it("build produces sw.js and manifest in build/client with content-hashed /index.html revision", () => {
    const swDest = join(rootDir, "build", "client", "sw.js");
    const indexDest = join(rootDir, "build", "client", "index.html");
    const manifestDest = join(rootDir, "build", "client", "manifest.webmanifest");
    expect(existsSync(swDest)).toBe(true);
    expect(statSync(swDest).size).toBeGreaterThan(0);
    expect(existsSync(indexDest)).toBe(true);
    expect(existsSync(manifestDest)).toBe(true);
    expect(statSync(manifestDest).size).toBeGreaterThan(0);

    const swContent = readFileSync(swDest, "utf-8");
    expect(swContent).not.toContain('revision: "1.0.0"');
    expect(swContent).not.toContain("__KNIFE_INDEX_HTML_REVISION__");

    const expectedRevision = createHash("sha256")
      .update(readFileSync(indexDest))
      .digest("hex")
      .slice(0, 16);
    const match = swContent.match(/revision:\s*"([a-f0-9]+)",\s*url:\s*"\/index\.html"/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(expectedRevision);
  });
});
