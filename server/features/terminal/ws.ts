import type { Server, ServerWebSocket } from "bun";
import { getSessionFromCookie } from "../../auth";
import type { KnifeConfig } from "../../config";
import { formatRequestLog, shouldLogRequest } from "../../middleware/request-log";
import { getClientIp } from "../../proxy";
import { PtySession } from "./pty";

export interface WsClientData {
  tabId: string;
  username: string;
  cols?: number;
  rows?: number;
  pty?: PtySession;
  lastPingTime: number;
}

export type KnifeWebSocket = ServerWebSocket<WsClientData>;

// In-memory active PTY sessions per tabId
const activePtys = new Map<string, PtySession>();
// Active WebSocket connection per tabId to resolve reconnection races
const activeSockets = new Map<string, KnifeWebSocket>();
// Grace timers for disconnected clients before killing PTY (60 seconds)
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getActivePty(tabId: string): PtySession | undefined {
  return activePtys.get(tabId);
}

export function closeActivePty(tabId: string): void {
  activeSockets.delete(tabId);
  const timer = disconnectTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(tabId);
  }
  const pty = activePtys.get(tabId);
  if (pty) {
    pty.close();
    activePtys.delete(tabId);
  }
}

export const websocketHandler = {
  async open(ws: KnifeWebSocket) {
    const { tabId, cols, rows } = ws.data;
    const initialCols = cols && cols >= 10 ? cols : 80;
    const initialRows = rows && rows >= 5 ? rows : 24;
    console.log(`[ws] Client connected to tab ${tabId} (${initialCols}x${initialRows})`);
    ws.data.lastPingTime = Date.now();

    // Track this socket as the active connection for the tab
    activeSockets.set(tabId, ws);

    // Cancel any pending disconnect timer for this tab
    const existingTimer = disconnectTimers.get(tabId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(tabId);
    }

    try {
      let pty = activePtys.get(tabId);

      // Clean up dead PTY session if process already exited while disconnected
      if (pty && !pty.isAlive) {
        closeActivePty(tabId);
        pty = undefined;
      }

      if (pty) {
        ws.data.pty = pty;

        // Replay serialized screen snapshot first so client receives accurate state + scrollback
        const snapshot = await pty.getSnapshot();
        if (activeSockets.get(tabId) !== ws || ws.readyState !== 1) {
          return;
        }
        if (snapshot) {
          ws.send(JSON.stringify({ type: "output", data: snapshot }));
        }

        // Re-attach existing PTY session callbacks
        pty.setDataCallback((data: string) => {
          try {
            if (ws.getBufferedAmount() > 65536) {
              setTimeout(() => {
                if (!ws.data.pty) return;
                ws.send(JSON.stringify({ type: "output", data }));
              }, 10);
            } else {
              ws.send(JSON.stringify({ type: "output", data }));
            }
          } catch {}
        });

        pty.setExitCallback((code: number) => {
          console.log(`[ws] Shell process exited for tab ${tabId} (exit code ${code})`);
          closeActivePty(tabId);
          try {
            ws.send(JSON.stringify({ type: "exit", code }));
          } catch {}
        });

        ws.data.pty = pty;
        pty.resize(initialCols, initialRows);
      } else {
        // Create new direct user shell PTY session
        pty = new PtySession({
          tabId,
          cols: initialCols,
          rows: initialRows,
          onData: (data: string) => {
            try {
              if (ws.getBufferedAmount() > 65536) {
                setTimeout(() => {
                  if (!ws.data.pty) return;
                  ws.send(JSON.stringify({ type: "output", data }));
                }, 10);
              } else {
                ws.send(JSON.stringify({ type: "output", data }));
              }
            } catch {}
          },
          onExit: (code: number) => {
            console.log(`[ws] Shell process exited for tab ${tabId} (exit code ${code})`);
            closeActivePty(tabId);
            try {
              ws.send(JSON.stringify({ type: "exit", code }));
            } catch {}
          },
        });

        ws.data.pty = pty;
        pty.resize(initialCols, initialRows);
        activePtys.set(tabId, pty);
      }
    } catch (err) {
      console.error(`[ws] Failed to spawn PTY for tab ${tabId}:`, err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Failed to attach to session: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
      ws.close(1011, "PTY spawn failed");
    }
  },

  message(ws: KnifeWebSocket, message: string | Buffer) {
    ws.data.lastPingTime = Date.now();
    const str = typeof message === "string" ? message : message.toString("utf-8");

    try {
      const msg = JSON.parse(str) as
        | { type: "input"; data: string }
        | { type: "resize"; cols: number; rows: number }
        | { type: "ping" }
        | { type: "refresh" };

      if (msg.type === "input") {
        ws.data.pty?.write(msg.data);
      } else if (msg.type === "resize") {
        if (typeof msg.cols === "number" && typeof msg.rows === "number") {
          ws.data.pty?.resize(msg.cols, msg.rows);
        }
      } else if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      } else if (msg.type === "refresh") {
        ws.data.pty?.refresh();
      }
    } catch {
      // Fallback: If not JSON, treat raw text as keyboard input
      ws.data.pty?.write(str);
    }
  },

  close(ws: KnifeWebSocket, code: number, reason: string) {
    const { tabId } = ws.data;
    console.log(
      `[ws] Client closed connection to tab ${tabId} (code ${code}, reason: ${reason || "none"})`,
    );

    // Only clean up and arm grace timer if this closing socket is the currently active one
    if (activeSockets.get(tabId) === ws) {
      activeSockets.delete(tabId);

      if (ws.data.pty) {
        ws.data.pty.clearCallbacks();
        ws.data.pty = undefined;
      }

      // Retain PTY in memory for 60 seconds to survive page refresh/reconnect
      if (activePtys.has(tabId) && !disconnectTimers.has(tabId)) {
        const timer = setTimeout(() => {
          disconnectTimers.delete(tabId);
          const pty = activePtys.get(tabId);
          if (pty) {
            console.log(`[ws] Disconnect grace timer expired for tab ${tabId}; terminating PTY`);
            pty.close();
            activePtys.delete(tabId);
          }
        }, 60_000);
        disconnectTimers.set(tabId, timer);
      }
    } else {
      // Stale socket closure from prior connection; detach reference without clearing new active session
      ws.data.pty = undefined;
    }
  },
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * Validates WebSocket/HTTP origin against configured listening host:port and public domain
 */
export function isAllowedOrigin(
  originHeader: string | null,
  publicDomain: string,
  host: string,
  port: number,
): boolean {
  if (!originHeader) return true; // Direct non-browser clients
  try {
    const originUrl = new URL(originHeader);
    const originHost = stripIpv6Brackets(originUrl.hostname.toLowerCase());
    const originPort = originUrl.port
      ? parseInt(originUrl.port, 10)
      : originUrl.protocol === "https:"
        ? 443
        : 80;

    const normalizedHost = stripIpv6Brackets(host.toLowerCase());

    // Exact match against configured listening host and port
    if (originHost === normalizedHost && originPort === port) {
      return true;
    }

    // Allow loopback hostname aliases only on the exact listening port
    if (
      originPort === port &&
      LOOPBACK_HOSTS.has(originHost) &&
      (LOOPBACK_HOSTS.has(normalizedHost) || WILDCARD_HOSTS.has(normalizedHost))
    ) {
      return true;
    }

    // Allow configured public domain with hostname and port verification
    if (publicDomain) {
      const publicUrl = new URL(
        publicDomain.startsWith("http") ? publicDomain : `https://${publicDomain}`,
      );
      const publicHost = stripIpv6Brackets(publicUrl.hostname.toLowerCase());
      const publicPort = publicUrl.port
        ? parseInt(publicUrl.port, 10)
        : publicUrl.protocol === "https:"
          ? 443
          : 80;
      if (originHost === publicHost && originPort === publicPort) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validates both Sec-Fetch-Site and Origin headers for state-changing HTTP and WS requests
 */
export function isAllowedRequestOrigin(
  headers: Headers,
  publicDomain: string,
  host: string,
  port: number,
): boolean {
  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite !== null) {
    const normalized = secFetchSite.trim().toLowerCase();
    if (normalized !== "same-origin" && normalized !== "none") {
      return false;
    }
  }

  return isAllowedOrigin(headers.get("origin"), publicDomain, host, port);
}

export function handleTerminalUpgrade(
  req: Request,
  server: Server<WsClientData>,
  config: KnifeConfig,
): Response | undefined {
  const url = new URL(req.url);
  const directIp = server.requestIP(req)?.address || "127.0.0.1";
  const clientIp = getClientIp(directIp, req.headers, config.trustedProxies);
  if (shouldLogRequest(url.pathname)) {
    console.log(formatRequestLog(req.method, url.pathname, clientIp));
  }
  if (!isAllowedRequestOrigin(req.headers, config.publicDomain, config.host, config.port)) {
    console.warn(
      `[ws] Forbidden: Origin '${req.headers.get("origin")}' not allowed for client IP ${clientIp}`,
    );
    return new Response("Forbidden origin", { status: 403 });
  }
  const session = getSessionFromCookie(req.headers.get("cookie"), config.sessionSecret);
  if (!session?.username) {
    console.warn(`[ws] Unauthorized WebSocket attempt from ${clientIp}`);
    return new Response("Unauthorized", { status: 401 });
  }
  const tabId = url.searchParams.get("tabId") || url.pathname.split("/").pop();
  if (!tabId) {
    return new Response("Missing tabId", { status: 400 });
  }
  const cols = parseInt(url.searchParams.get("cols") || "0", 10) || 80;
  const rows = parseInt(url.searchParams.get("rows") || "0", 10) || 24;
  if (
    server.upgrade(req, {
      data: { tabId, username: session.username, cols, rows, lastPingTime: Date.now() },
    })
  ) {
    return undefined;
  }
  return new Response("WebSocket upgrade failed", { status: 400 });
}
