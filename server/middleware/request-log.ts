const SKIPPED_EXACT_PATHS = new Set([
  "/sw.js",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/health",
  "/api/health",
]);

const SKIPPED_PREFIXES = ["/assets/", "/icons/"];

/**
 * Returns true when an HTTP request pathname should be written to the server log.
 * Skips static assets, PWA/icon files, and health check endpoints.
 */
export function shouldLogRequest(pathname: string): boolean {
  const cleanPath = pathname.split("?")[0] ?? "";
  if (SKIPPED_EXACT_PATHS.has(cleanPath)) {
    return false;
  }
  return !SKIPPED_PREFIXES.some((prefix) => cleanPath.startsWith(prefix));
}

/**
 * Formats an HTTP request log line with only method, pathname, and client IP.
 * Strips any query string so tokens or parameters are never logged.
 */
export function formatRequestLog(method: string, pathname: string, ip: string): string {
  const cleanPath = pathname.split("?")[0] ?? "";
  return `[http] ${method} ${cleanPath} (from: ${ip})`;
}
