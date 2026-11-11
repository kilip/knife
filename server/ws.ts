import type { ServerWebSocket } from "bun";
import { PtySession } from "./pty";

export interface WsClientData {
  tabId: string;
  sessionName: string;
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
  open(ws: KnifeWebSocket) {
    const { tabId, sessionName, cols, rows } = ws.data;
    const initialCols = cols && cols >= 10 ? cols : 80;
    const initialRows = rows && rows >= 5 ? rows : 24;
    console.log(
      `[ws] Client connected to tab ${tabId} (${sessionName}, ${initialCols}x${initialRows})`,
    );
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
        // Replay buffered terminal output first so client receives historical context
        const buf = pty.getBuffer();
        if (buf) {
          ws.send(JSON.stringify({ type: "output", data: buf }));
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
          console.log(`[ws] Shell process exited for ${sessionName} (exit code ${code})`);
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
          sessionName,
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
            console.log(`[ws] Shell process exited for ${sessionName} (exit code ${code})`);
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
      console.error(`[ws] Failed to spawn PTY for ${sessionName}:`, err);
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

/**
 * Validates WebSocket origin against configured public domain and scheme
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
    const originHost = originUrl.hostname;
    const originPort = originUrl.port
      ? parseInt(originUrl.port, 10)
      : originUrl.protocol === "https:"
        ? 443
        : 80;

    // Allow localhost / loopback access
    if (originHost === "localhost" || originHost === "127.0.0.1" || originHost === "::1") {
      return true;
    }

    // Allow configured server host
    if (originHost === host && originPort === port) {
      return true;
    }

    // Allow configured public domain with hostname and port verification
    if (publicDomain) {
      const publicUrl = new URL(
        publicDomain.startsWith("http") ? publicDomain : `https://${publicDomain}`,
      );
      const publicPort = publicUrl.port
        ? parseInt(publicUrl.port, 10)
        : publicUrl.protocol === "https:"
          ? 443
          : 80;
      if (originHost === publicUrl.hostname && originPort === publicPort) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
