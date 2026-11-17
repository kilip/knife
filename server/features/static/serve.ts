import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const clientBuildDir = existsSync(join(process.cwd(), "build", "client"))
  ? join(process.cwd(), "build", "client")
  : join(import.meta.dir, "..", "..", "..", "build", "client");

/**
 * Serves a built static asset from `build/client` with appropriate cache and
 * PWA/service-worker headers, or returns `null` if the file does not exist.
 */
export function serveStaticFile(
  path: string,
  contentType?: string,
  secHeaders?: Headers,
): Response | null {
  const relPath = path.replace(/^\//, "");
  if (!relPath) {
    return null;
  }
  const fullPath = join(clientBuildDir, relPath);
  if (existsSync(fullPath)) {
    try {
      if (!statSync(fullPath).isFile()) {
        return null;
      }
    } catch {
      return null;
    }
    const file = Bun.file(fullPath);
    const headers = new Headers(secHeaders);
    if (contentType) {
      headers.set("Content-Type", contentType);
    }
    // Specific header handling for Service Worker & PWA Manifest
    if (path === "/sw.js") {
      headers.set("Content-Type", "application/javascript; charset=utf-8");
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Service-Worker-Allowed", "/");
    } else if (path === "/manifest.webmanifest") {
      headers.set("Content-Type", "application/manifest+json; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
    } else if (path.includes("/assets/")) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else if (path.startsWith("/icons/")) {
      headers.set("Cache-Control", "public, max-age=86400");
    } else {
      headers.set("Cache-Control", "no-cache");
    }
    return new Response(file, { headers });
  }
  return null;
}
