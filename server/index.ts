import { existsSync, statSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join, dirname, basename, resolve, relative, isAbsolute } from "node:path";
import { loadConfig, saveConfig, parseCliArgs, type KnifeConfig } from "./config";
import { killSession, getTabCwd } from "./tmux";
import { getUserShell, getShellName, isTmuxInstalled } from "./shell";
import { loadTabs, saveTabs, type TabData } from "./storage";
import {
  generateSetupToken,
  getActiveSetupToken,
  verifySetupToken,
  consumeSetupToken,
  createSessionCookieHeader,
  createSessionToken,
  getSessionFromCookie,
  getGitHubOAuthUrl,
  exchangeGitHubCode,
  fetchGitHubUser,
  getPublicOrigin,
} from "./auth";
import { getClientIp } from "./proxy";
import { websocketHandler, isAllowedOrigin, getActivePty, closeActivePty } from "./ws";
import {
  normalizePath,
  isProtectedPath,
  listDirectory,
  statItem,
  createZipStream,
  getDefaultHome,
} from "./fs";

import { handleServiceCommand } from "./service";
import {
  getCurrentVersion,
  checkLatestVersion,
  detectPackageManager,
  executePackageUpdate,
  isManagedService,
  triggerRestart,
} from "./update";

// Handle background service commands (install, uninstall, start, stop, status, restart)
try {
  const isServiceHandled = await handleServiceCommand(process.argv.slice(2));
  if (isServiceHandled) {
    process.exit(0);
  }
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\x1b[31mError:\x1b[0m ${msg}`);
  process.exit(1);
}

// Tmux is optional; direct user shell is the primary terminal mode
if (!isTmuxInstalled()) {
  console.log("[server] tmux is not installed. Direct user shell mode is active.");
}

// Parse CLI arguments and load configuration
const cliArgs = parseCliArgs(process.argv.slice(2));
if (cliArgs.help) {
  console.log(`
Usage: knife [command] [options]

Commands:
  service <action>      Manage background service (install, uninstall, start, stop, status, restart)

Options:
  --host <ip>           Listen host address (default: 127.0.0.1 or KNIFE_HOST)
  -p, --port <port>     Listen port number (default: 3000 or KNIFE_PORT)
  -d, --domain <domain> Public domain (default: KNIFE_PUBLIC_DOMAIN or config.json)
  --config <path>       Path to config.json (default: ./config.json or KNIFE_CONFIG_PATH)
  -h, --help            Show help message
`);
  process.exit(0);
}

let { config, isFirstRun, configPath } = loadConfig(cliArgs);

// Initialize tabs from persistent storage
let currentTabs = loadTabs();
if (currentTabs.length === 0) {
  const shellName = getShellName();
  const initialId = crypto.randomUUID().slice(0, 8);
  currentTabs.push({
    id: initialId,
    name: `${shellName} 1`,
    sessionName: `knife-${initialId}`,
    order: 0,
    createdAt: Date.now(),
  });
  saveTabs(currentTabs);
}

// First run: generate one-time setup token
if (isFirstRun) {
  const token = generateSetupToken();
  const displayHost = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
  const setupUrl = `http://${displayHost}:${config.port}/setup?token=${token}`;

  console.log("\n" + "=".repeat(64));
  console.log("  KNIFE - First Run Setup");
  console.log("=".repeat(64));
  console.log("\nNo existing configuration found. Knife is running in setup mode.");
  if (config.publicDomain) {
    const publicSetupUrl = `${config.publicScheme}://${config.publicDomain}/setup?token=${token}`;
    console.log(`  Public: \x1b[36m\x1b[1m${publicSetupUrl}\x1b[0m`);
    console.log(`  Local:  \x1b[36m\x1b[1m${setupUrl}\x1b[0m\n`);
  } else {
    console.log(`  \x1b[36m\x1b[1m${setupUrl}\x1b[0m\n`);
  }
  console.log(`One-time Setup Token: \x1b[33m${token}\x1b[0m`);
  console.log("=".repeat(64) + "\n");
} else {
  const origin = getPublicOrigin(config);
  console.log("\n" + "=".repeat(64));
  console.log(`  KNIFE - Web Terminal`);
  console.log("=".repeat(64));
  console.log(`Listening on:       http://${config.host}:${config.port}`);
  console.log(`Configured Public:  ${origin}`);
  console.log(`Allowed User:       ${config.auth?.allowedUsername}`);
  console.log(`GitHub Callback:    ${origin}/auth/github/callback`);
  console.log("=".repeat(64) + "\n");
}

function getSecurityHeaders(cfg: KnifeConfig): Headers {
  const headers = new Headers();
  const domain = cfg.publicDomain || `${cfg.host}:${cfg.port}`;
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ws://${domain} wss://${domain} ${cfg.host === "0.0.0.0" || cfg.host === "127.0.0.1" ? "ws: wss:" : ""}`.trim(),
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

const clientBuildDir = existsSync(join(process.cwd(), "build", "client"))
  ? join(process.cwd(), "build", "client")
  : join(import.meta.dir, "..", "build", "client");

function serveStaticFile(path: string, contentType?: string): Response | null {
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
    const headers = new Headers();
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

// Global server instance
try {
  Bun.serve({
    hostname: config.host,
    port: config.port,
    websocket: websocketHandler,

    async fetch(req, server) {
      const url = new URL(req.url);
      const directIp = server.requestIP(req)?.address || "127.0.0.1";
      const clientIp = getClientIp(directIp, req.headers, config.trustedProxies);
      console.log(`[http] ${req.method} ${url.pathname}${url.search} (from: ${clientIp})`);

      // 1. WebSocket Upgrade Handler
      if (url.pathname === "/ws/terminal" || url.pathname.startsWith("/ws/terminal/")) {
        const originHeader = req.headers.get("origin");
        if (!isAllowedOrigin(originHeader, config.publicDomain, config.host, config.port)) {
          console.warn(
            `[ws] Forbidden: Origin '${originHeader}' not allowed for client IP ${clientIp}`,
          );
          return new Response("Forbidden origin", { status: 403 });
        }

        // Authenticate WebSocket connection
        let username: string | null = null;
        const cookie = req.headers.get("cookie");
        const session = getSessionFromCookie(cookie, config.sessionSecret);

        if (session) {
          username = session.username;
        } else {
          // Alternatively check token in query parameter (for environments where cookie isn't passed on ws)
          const queryToken = url.searchParams.get("sessionToken");
          if (queryToken) {
            const verified = getSessionFromCookie(
              `knife_session=${queryToken}`,
              config.sessionSecret,
            );
            if (verified) username = verified.username;
          }
        }

        if (!username && !isFirstRun) {
          console.warn(`[ws] Unauthorized WebSocket attempt from ${clientIp}`);
          return new Response("Unauthorized", { status: 401 });
        }

        // Resolve tab ID
        const tabId = url.searchParams.get("tabId") || url.pathname.split("/").pop();
        if (!tabId) {
          return new Response("Missing tabId", { status: 400 });
        }

        const tab = currentTabs.find((t) => t.id === tabId);
        const sessionName = tab ? tab.sessionName : `knife-${tabId}`;

        const cols = parseInt(url.searchParams.get("cols") || "0", 10) || 80;
        const rows = parseInt(url.searchParams.get("rows") || "0", 10) || 24;

        const upgraded = server.upgrade(req, {
          data: {
            tabId,
            sessionName,
            username: username || "setup-user",
            cols,
            rows,
            lastPingTime: Date.now(),
          },
        });

        if (upgraded) {
          return undefined;
        }
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      // Security headers for HTTP responses
      const secHeaders = getSecurityHeaders(config);

      // 2. Health check endpoint
      if (url.pathname === "/health" || url.pathname === "/api/health") {
        return Response.json(
          {
            status: "ok",
            isFirstRun,
            version: getCurrentVersion(),
          },
          { headers: secHeaders },
        );
      }

      // 3. Public config endpoint (used by frontend to get domain, theme, setup status)
      if (url.pathname === "/api/config/public") {
        return Response.json(
          {
            publicDomain: config.publicDomain,
            publicScheme: config.publicScheme,
            theme: config.theme,
            isFirstRun,
            callbackUrl: config.publicDomain
              ? `${getPublicOrigin(config)}/auth/github/callback`
              : `https://<your-public-domain>/auth/github/callback`,
            allowedUsername: config.auth?.allowedUsername || null,
          },
          { headers: secHeaders },
        );
      }

      // 4. First run setup API
      if (url.pathname === "/api/setup") {
        if (req.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405, headers: secHeaders });
        }

        try {
          const body = (await req.json()) as {
            token?: string;
            publicDomain?: string;
            publicScheme?: "http" | "https";
            githubClientId?: string;
            githubClientSecret?: string;
            allowedUsername?: string;
            theme?: string;
            trustedProxies?: string[];
          };
          console.log(
            `[setup] Received setup attempt: user=${body.allowedUsername}, domain=${body.publicDomain}`,
          );

          if (!isFirstRun && !getActiveSetupToken()) {
            return Response.json(
              { error: "Setup has already been completed." },
              { status: 400, headers: secHeaders },
            );
          }

          if (!body.token || !verifySetupToken(body.token)) {
            console.warn(
              `[setup] Token verification failed! Received: ${body.token}, Expected: ${getActiveSetupToken()}`,
            );
            return Response.json(
              { error: "Invalid or expired setup token." },
              { status: 403, headers: secHeaders },
            );
          }

          if (!body.publicDomain || typeof body.publicDomain !== "string") {
            return Response.json(
              { error: "Public domain is required (e.g. knife.example.com)." },
              { status: 400, headers: secHeaders },
            );
          }

          if (!body.githubClientId || !body.githubClientSecret) {
            return Response.json(
              { error: "GitHub Client ID and Client Secret are required." },
              { status: 400, headers: secHeaders },
            );
          }

          if (!body.allowedUsername || typeof body.allowedUsername !== "string") {
            return Response.json(
              { error: "Allowed GitHub username is required." },
              { status: 400, headers: secHeaders },
            );
          }

          // Clean up domain (remove leading protocol if entered by user)
          const cleanDomain = body.publicDomain
            .trim()
            .replace(/^https?:\/\//, "")
            .replace(/\/.*$/, "");

          // Update config
          config.publicDomain = cleanDomain;
          config.publicScheme = body.publicScheme === "http" ? "http" : "https";
          if (body.theme) config.theme = body.theme;
          if (body.trustedProxies && Array.isArray(body.trustedProxies)) {
            config.trustedProxies = body.trustedProxies;
          }

          config.auth = {
            githubClientId: body.githubClientId.trim(),
            githubClientSecret: body.githubClientSecret.trim(),
            allowedUsername: body.allowedUsername.trim(),
          };

          // Save config to disk
          saveConfig(config, configPath);

          // Invalidate setup token
          consumeSetupToken(body.token);
          isFirstRun = false;

          console.log(
            `[setup] Setup successfully completed by user '${config.auth.allowedUsername}'!`,
          );

          return Response.json(
            {
              success: true,
              redirect: "/login",
            },
            { headers: secHeaders },
          );
        } catch (err) {
          console.error("[setup] Error processing setup:", err);
          return Response.json(
            { error: "Failed to process setup request." },
            { status: 500, headers: secHeaders },
          );
        }
      }

      // 5. GitHub OAuth Routes
      if (url.pathname === "/auth/github") {
        if (isFirstRun || !config.auth) {
          return Response.redirect("/setup", 302);
        }
        const state = crypto.randomUUID();
        const authUrl = getGitHubOAuthUrl(config, state);
        const headers = new Headers(secHeaders);
        const isSecure = config.publicScheme === "https";
        headers.set(
          "Set-Cookie",
          `knife_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isSecure ? "; Secure" : ""}`,
        );
        headers.set("Location", authUrl);
        return new Response(null, { status: 302, headers });
      }

      if (url.pathname === "/auth/github/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookieHeader = req.headers.get("cookie") || "";

        // Verify state
        const stateCookie = cookieHeader
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("knife_oauth_state="))
          ?.split("=")[1];

        if (!state || !stateCookie || state !== stateCookie) {
          return new Response("Invalid or expired OAuth state parameter. Please try again.", {
            status: 400,
            headers: secHeaders,
          });
        }

        if (!code) {
          return new Response("Missing OAuth code parameter from GitHub.", {
            status: 400,
            headers: secHeaders,
          });
        }

        const tokenResult = await exchangeGitHubCode(config, code);
        if (!tokenResult) {
          return new Response("Failed to exchange GitHub authorization code.", {
            status: 500,
            headers: secHeaders,
          });
        }

        const user = await fetchGitHubUser(tokenResult.accessToken);
        if (!user) {
          return new Response("Failed to fetch GitHub user profile.", {
            status: 500,
            headers: secHeaders,
          });
        }

        const allowed = config.auth?.allowedUsername?.toLowerCase();
        if (!allowed || user.login.toLowerCase() !== allowed) {
          console.warn(
            `[auth] Unauthorized login attempt: github user '${user.login}', allowed '${allowed}'`,
          );
          return new Response(
            `Access Denied: GitHub user '${user.login}' is not authorized to access this knife instance.`,
            { status: 403, headers: secHeaders },
          );
        }

        // Create authenticated session
        const sessionToken = createSessionToken(user.login, config.sessionSecret);
        const cookieVal = createSessionCookieHeader(sessionToken, config);

        const headers = new Headers(secHeaders);
        headers.set("Set-Cookie", cookieVal);
        headers.set("Location", "/");
        return new Response(null, { status: 302, headers });
      }

      // Logout endpoint
      if (url.pathname === "/auth/logout") {
        const headers = new Headers(secHeaders);
        headers.set("Set-Cookie", createSessionCookieHeader("", config, true));
        headers.set("Location", "/login");
        return new Response(null, { status: 302, headers });
      }

      // Check current session
      const currentSession = getSessionFromCookie(req.headers.get("cookie"), config.sessionSecret);

      // 6. User Profile Endpoint
      if (url.pathname === "/api/me") {
        if (!currentSession) {
          return Response.json({ authenticated: false }, { status: 401, headers: secHeaders });
        }
        return Response.json(
          {
            authenticated: true,
            username: currentSession.username,
            theme: config.theme,
            shell: getUserShell(),
            shellName: getShellName(),
          },
          { headers: secHeaders },
        );
      }

      // 7. Tabs Management API
      if (url.pathname === "/api/tabs" || url.pathname.startsWith("/api/tabs/")) {
        if (!currentSession) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: secHeaders });
        }

        // GET /api/tabs
        if (url.pathname === "/api/tabs" && req.method === "GET") {
          return Response.json(currentTabs, { headers: secHeaders });
        }

        // POST /api/tabs (Create tab)
        if (url.pathname === "/api/tabs" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as {
            name?: string;
            cols?: number;
            rows?: number;
          };
          const id = crypto.randomUUID().slice(0, 8);
          const shellName = getShellName();
          const tabName = body.name?.trim() || `${shellName} ${currentTabs.length + 1}`;
          const sessionName = `knife-${id}`;

          const newTab: TabData = {
            id,
            name: tabName,
            sessionName,
            order: currentTabs.length,
            createdAt: Date.now(),
          };

          currentTabs.push(newTab);
          saveTabs(currentTabs);

          return Response.json(newTab, { status: 201, headers: secHeaders });
        }

        // POST /api/tabs/reorder
        if (url.pathname === "/api/tabs/reorder" && req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as { tabIds?: string[] };
          if (Array.isArray(body.tabIds)) {
            const idMap = new Map(currentTabs.map((t) => [t.id, t]));
            const reordered: TabData[] = [];
            body.tabIds.forEach((id, index) => {
              const tab = idMap.get(id);
              if (tab) {
                tab.order = index;
                reordered.push(tab);
                idMap.delete(id);
              }
            });
            // Append any tabs not included in list
            idMap.forEach((tab) => {
              tab.order = reordered.length;
              reordered.push(tab);
            });
            currentTabs = reordered;
            saveTabs(currentTabs);
          }
          return Response.json(currentTabs, { headers: secHeaders });
        }

        // Specific Tab Operations: PATCH /api/tabs/:id, DELETE /api/tabs/:id
        // Tab CWD Endpoint: GET /api/tabs/:id/cwd
        const cwdMatch = url.pathname.match(/^\/api\/tabs\/([^/]+)\/cwd$/);
        if (cwdMatch && req.method === "GET") {
          const targetTabId = cwdMatch[1];
          const tab = currentTabs.find((t) => t.id === targetTabId);
          if (!tab) {
            return Response.json({ error: "Tab not found" }, { status: 404, headers: secHeaders });
          }
          const activePty = getActivePty(tab.id);
          const cwd =
            activePty?.getCwd() ||
            (isTmuxInstalled() ? getTabCwd(tab.sessionName) : null) ||
            getDefaultHome();
          return Response.json(
            { id: tab.id, sessionName: tab.sessionName, cwd },
            { headers: secHeaders },
          );
        }

        const tabId = url.pathname.slice("/api/tabs/".length);
        const tabIndex = currentTabs.findIndex((t) => t.id === tabId);

        if (tabIndex === -1) {
          return Response.json({ error: "Tab not found" }, { status: 404, headers: secHeaders });
        }

        // Rename tab
        if (req.method === "PATCH") {
          const body = (await req.json().catch(() => ({}))) as { name?: string };
          if (body.name && typeof body.name === "string") {
            currentTabs[tabIndex].name = body.name.trim();
            saveTabs(currentTabs);
          }
          return Response.json(currentTabs[tabIndex], { headers: secHeaders });
        }

        // Delete / Close tab
        if (req.method === "DELETE") {
          const deletedTab = currentTabs[tabIndex];
          closeActivePty(deletedTab.id);
          if (isTmuxInstalled()) {
            killSession(deletedTab.sessionName);
          }
          currentTabs.splice(tabIndex, 1);

          // If no tabs left, automatically create a new one
          if (currentTabs.length === 0) {
            const newId = crypto.randomUUID().slice(0, 8);
            const shellName = getShellName();
            const newSession = `knife-${newId}`;
            currentTabs.push({
              id: newId,
              name: `${shellName} 1`,
              sessionName: newSession,
              order: 0,
              createdAt: Date.now(),
            });
          }

          // Re-index orders
          currentTabs.forEach((t, i) => (t.order = i));
          saveTabs(currentTabs);

          return Response.json(
            { success: true, remainingTabs: currentTabs },
            { headers: secHeaders },
          );
        }
      }

      // 8. Filesystem API (/api/fs/*)
      if (url.pathname.startsWith("/api/fs/")) {
        if (!currentSession) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: secHeaders });
        }

        // GET /api/fs/list?path=<abs_path>&hidden=<bool>
        if (url.pathname === "/api/fs/list" && req.method === "GET") {
          const reqPath = url.searchParams.get("path");
          const hidden = url.searchParams.get("hidden") === "true";
          try {
            const result = listDirectory(reqPath || getDefaultHome(), hidden);
            return Response.json(result, { headers: secHeaders });
          } catch (err: any) {
            return Response.json(
              { error: err.message || "Failed to list directory" },
              { status: 400, headers: secHeaders },
            );
          }
        }

        // GET /api/fs/stat?path=<abs_path>
        if (url.pathname === "/api/fs/stat" && req.method === "GET") {
          const reqPath = url.searchParams.get("path");
          if (!reqPath) {
            return Response.json(
              { error: "Missing path query parameter" },
              { status: 400, headers: secHeaders },
            );
          }
          try {
            const result = statItem(reqPath);
            return Response.json(result, { headers: secHeaders });
          } catch (err: any) {
            return Response.json(
              { error: err.message || "Failed to stat item" },
              { status: 404, headers: secHeaders },
            );
          }
        }

        // GET /api/fs/download?path=<abs_path>&inline=<bool>
        if (url.pathname === "/api/fs/download" && req.method === "GET") {
          const reqPath = url.searchParams.get("path");
          if (!reqPath) {
            return Response.json(
              { error: "Missing path query parameter" },
              { status: 400, headers: secHeaders },
            );
          }
          const norm = normalizePath(reqPath);
          if (!existsSync(norm)) {
            return Response.json({ error: "File not found" }, { status: 404, headers: secHeaders });
          }
          const stat = statSync(norm);
          if (stat.isDirectory()) {
            return Response.json(
              { error: "Cannot download directory directly; use archive" },
              { status: 400, headers: secHeaders },
            );
          }
          const inline =
            url.searchParams.get("inline") === "true" || url.searchParams.get("inline") === "1";
          const file = Bun.file(norm);
          const headers = new Headers(secHeaders);
          headers.set("Content-Type", file.type || "application/octet-stream");
          headers.set(
            "Content-Disposition",
            inline ? "inline" : `attachment; filename="${basename(norm)}"`,
          );
          return new Response(file, { headers });
        }

        // POST /api/fs/archive
        if (url.pathname === "/api/fs/archive" && req.method === "POST") {
          try {
            const body = (await req.json().catch(() => ({}))) as { paths?: string[] };
            if (!body.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
              return Response.json(
                { error: "paths array is required" },
                { status: 400, headers: secHeaders },
              );
            }
            const { stream, archiveName } = await createZipStream(body.paths);
            const headers = new Headers(secHeaders);
            headers.set("Content-Type", "application/zip");
            headers.set("Content-Disposition", `attachment; filename="${archiveName}"`);
            return new Response(stream, { headers });
          } catch (err: any) {
            return Response.json(
              { error: err.message || "Failed to create archive" },
              { status: 500, headers: secHeaders },
            );
          }
        }

        // POST /api/fs/upload
        if (url.pathname === "/api/fs/upload" && req.method === "POST") {
          try {
            const formData = await req.formData();
            const rawTargetDir = (formData.get("targetDir") as string) || "";
            const targetDir = normalizePath(rawTargetDir);
            const overwrite = formData.get("overwrite") === "true";

            if (isProtectedPath(targetDir)) {
              return Response.json(
                { error: "Target directory is protected" },
                { status: 403, headers: secHeaders },
              );
            }

            if (!existsSync(targetDir)) {
              mkdirSync(targetDir, { recursive: true });
            }

            const files = formData.getAll("files") as File[];
            const relPaths = formData.getAll("relativePaths") as string[];

            const uploaded: string[] = [];
            const skipped: string[] = [];

            for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const relPath = relPaths[i] || file.name;
              if (!relPath || typeof relPath !== "string") continue;
              const safeRel = relPath.replace(/^[/\\]+/, "");
              const destPath = resolve(targetDir, safeRel);
              const relFromTarget = relative(targetDir, destPath);

              // Enforce boundary containment within targetDir
              if (
                relFromTarget.startsWith("..") ||
                isAbsolute(relFromTarget) ||
                relFromTarget === ""
              ) {
                continue;
              }
              if (isProtectedPath(destPath)) {
                skipped.push(relPath);
                continue;
              }

              if (existsSync(destPath) && !overwrite) {
                skipped.push(relPath);
                continue;
              }

              mkdirSync(dirname(destPath), { recursive: true });
              await Bun.write(destPath, file);
              uploaded.push(relPath);
            }

            return Response.json({ success: true, uploaded, skipped }, { headers: secHeaders });
          } catch (err: any) {
            return Response.json(
              { error: err.message || "Failed to upload files" },
              { status: 500, headers: secHeaders },
            );
          }
        }

        // POST /api/fs/action
        if (url.pathname === "/api/fs/action" && req.method === "POST") {
          try {
            const body = (await req.json().catch(() => ({}))) as {
              action?: string;
              path?: string;
              paths?: string[];
              oldPath?: string;
              newPath?: string;
              name?: string;
              parent?: string;
            };

            if (!body.action) {
              return Response.json(
                { error: "Missing action" },
                { status: 400, headers: secHeaders },
              );
            }

            if (body.action === "mkdir") {
              const rawTarget =
                body.path || (body.parent && body.name ? join(body.parent, body.name) : "");
              if (!rawTarget || typeof rawTarget !== "string" || !rawTarget.trim()) {
                return Response.json(
                  { error: "Missing or invalid path for directory creation" },
                  { status: 400, headers: secHeaders },
                );
              }
              const target = normalizePath(rawTarget);
              if (isProtectedPath(target)) {
                return Response.json(
                  { error: "Cannot create directory in protected location" },
                  { status: 403, headers: secHeaders },
                );
              }
              mkdirSync(target, { recursive: true });
              return Response.json({ success: true, path: target }, { headers: secHeaders });
            }

            if (body.action === "touch" || body.action === "createFile") {
              const rawTarget =
                body.path || (body.parent && body.name ? join(body.parent, body.name) : "");
              if (!rawTarget || typeof rawTarget !== "string" || !rawTarget.trim()) {
                return Response.json(
                  { error: "Missing or invalid path for file creation" },
                  { status: 400, headers: secHeaders },
                );
              }
              const target = normalizePath(rawTarget);
              if (isProtectedPath(target)) {
                return Response.json(
                  { error: "Cannot create file in protected location" },
                  { status: 403, headers: secHeaders },
                );
              }
              if (!existsSync(target)) {
                mkdirSync(dirname(target), { recursive: true });
                writeFileSync(target, "");
              }
              return Response.json({ success: true, path: target }, { headers: secHeaders });
            }

            if (body.action === "rename") {
              const rawOld = body.oldPath || body.path;
              const rawNew =
                body.newPath ||
                (body.name && rawOld ? join(dirname(normalizePath(rawOld)), body.name) : undefined);
              if (
                !rawOld ||
                typeof rawOld !== "string" ||
                !rawOld.trim() ||
                !rawNew ||
                typeof rawNew !== "string" ||
                !rawNew.trim()
              ) {
                return Response.json(
                  { error: "Both source and destination paths must be provided" },
                  { status: 400, headers: secHeaders },
                );
              }
              const oldP = normalizePath(rawOld);
              const newP = normalizePath(rawNew);
              if (isProtectedPath(oldP) || isProtectedPath(newP)) {
                return Response.json(
                  { error: "Cannot rename protected path" },
                  { status: 403, headers: secHeaders },
                );
              }
              if (!existsSync(oldP)) {
                return Response.json(
                  { error: "Source path not found" },
                  { status: 404, headers: secHeaders },
                );
              }
              renameSync(oldP, newP);
              return Response.json(
                { success: true, oldPath: oldP, newPath: newP },
                { headers: secHeaders },
              );
            }

            if (body.action === "delete") {
              const rawList = (body.paths || (body.path ? [body.path] : [])).filter(
                (p): p is string => typeof p === "string" && p.trim().length > 0,
              );
              if (rawList.length === 0) {
                return Response.json(
                  { error: "No valid paths specified for deletion" },
                  { status: 400, headers: secHeaders },
                );
              }
              const toDelete = rawList.map((p) => normalizePath(p));
              for (const p of toDelete) {
                if (isProtectedPath(p)) {
                  return Response.json(
                    { error: `Cannot delete protected path: ${p}` },
                    { status: 403, headers: secHeaders },
                  );
                }
              }
              for (const p of toDelete) {
                if (existsSync(p)) {
                  rmSync(p, { recursive: true, force: true });
                }
              }
              return Response.json({ success: true, deleted: toDelete }, { headers: secHeaders });
            }

            return Response.json(
              { error: `Unknown action: ${body.action}` },
              { status: 400, headers: secHeaders },
            );
          } catch (err: any) {
            return Response.json(
              { error: err.message || "Action failed" },
              { status: 500, headers: secHeaders },
            );
          }
        }
      }

      // 8. Theme preference endpoint
      if (url.pathname === "/api/theme") {
        if (req.method === "POST") {
          const body = (await req.json().catch(() => ({}))) as { theme?: string };
          if (body.theme && typeof body.theme === "string") {
            config.theme = body.theme;
            saveConfig(config, configPath);
          }
          return Response.json({ theme: config.theme }, { headers: secHeaders });
        }
        return Response.json({ theme: config.theme }, { headers: secHeaders });
      }

      // 9. Self-Update System API (/api/system/update/*)
      if (url.pathname.startsWith("/api/system/update")) {
        if (!currentSession) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers: secHeaders });
        }

        // GET /api/system/update/check
        if (url.pathname === "/api/system/update/check" && req.method === "GET") {
          const force = url.searchParams.get("force") === "true";
          const currentVersion = getCurrentVersion();
          const checkRes = await checkLatestVersion(currentVersion, force);
          const isService = await isManagedService("knife");
          const isTmux = isTmuxInstalled();
          const activeTabsCount = currentTabs.length;
          const pkgManager = detectPackageManager();

          return Response.json(
            {
              currentVersion: checkRes.currentVersion,
              latestVersion: checkRes.latestVersion,
              updateAvailable: checkRes.updateAvailable,
              cached: checkRes.cached ?? false,
              isService,
              isTmux,
              activeTabsCount,
              command: `${pkgManager.command} ${pkgManager.args.join(" ")}`,
            },
            { headers: secHeaders },
          );
        }

        // POST /api/system/update/apply
        if (url.pathname === "/api/system/update/apply" && req.method === "POST") {
          const pkgManager = detectPackageManager();
          const isService = await isManagedService("knife");
          const remediationCommand = `${pkgManager.command} ${pkgManager.args.join(" ")}`;

          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              const sendEvent = (event: string, data: Record<string, unknown>) => {
                controller.enqueue(
                  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
                );
              };

              sendEvent("log", {
                line: `[update] Starting self-update via ${pkgManager.command}...`,
              });
              sendEvent("log", { line: `[update] Command: ${remediationCommand}` });

              const updateResult = await executePackageUpdate((line) => {
                sendEvent("log", { line });
              }, pkgManager);

              if (!updateResult.success) {
                sendEvent("error", {
                  error: updateResult.error || "Update command failed",
                  remediationCommand,
                });
                controller.close();
                return;
              }

              sendEvent("log", { line: "[update] Initiating server restart..." });
              sendEvent("complete", {
                message: "Update installed successfully. Server is restarting.",
                isService,
              });

              // Schedule restart
              triggerRestart({
                isService,
                serviceName: "knife",
              });

              controller.close();
            },
          });

          const streamHeaders = new Headers(secHeaders);
          streamHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
          streamHeaders.set("Cache-Control", "no-cache, no-transform");
          streamHeaders.set("Connection", "keep-alive");
          return new Response(stream, { headers: streamHeaders });
        }
      }

      // 9. Static Asset Serving
      // Try serving exact static file from build/client
      const staticFile = serveStaticFile(url.pathname);
      if (staticFile) {
        return staticFile;
      }

      // 10. SPA / Page Routing
      // Handle redirects for setup and login
      if (isFirstRun) {
        if (!url.pathname.startsWith("/setup")) {
          const token = getActiveSetupToken();
          return Response.redirect(`/setup?token=${token}`, 302);
        }
      } else {
        if (url.pathname === "/setup") {
          return Response.redirect("/", 302);
        }
        if (!currentSession && url.pathname !== "/login") {
          return Response.redirect("/login", 302);
        }
        if (currentSession && url.pathname === "/login") {
          return Response.redirect("/", 302);
        }
      }

      // Serve index.html for all SPA routes
      const indexHtml = serveStaticFile("/index.html", "text/html; charset=utf-8");
      if (indexHtml) {
        const text = await indexHtml.text();
        const headers = new Headers(secHeaders);
        headers.set("Content-Type", "text/html; charset=utf-8");
        headers.set("Cache-Control", "no-cache");
        return new Response(text, { headers });
      }

      return new Response("Application not built. Please run 'bun run build'.", {
        status: 503,
        headers: secHeaders,
      });
    },
  });
} catch (err: unknown) {
  const errorObj = err as { code?: string; message?: string };
  if (errorObj?.code === "EADDRINUSE" || errorObj?.message?.includes("address already in use")) {
    console.error("\n=======================================================");
    console.error(`FATAL: Port ${config.port} is already in use on ${config.host}.`);
    console.error("Please stop the existing process or choose a different port using:");
    console.error(`  --port <number> or KNIFE_PORT=<number>`);
    console.error("=======================================================\n");
  } else {
    console.error("Failed to start Knife server:", err);
  }
  process.exit(1);
}
