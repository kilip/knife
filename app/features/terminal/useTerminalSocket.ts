import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { type RefObject, useCallback, useEffect, useRef } from "react";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_FACTOR = 1.5;
const RECONNECT_MAX_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 15000;
const PONG_TIMEOUT_MS = 10000;

/** Exponential backoff delay for the given zero-based reconnect attempt. */
export function getReconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_BASE_MS * RECONNECT_FACTOR ** attempt, RECONNECT_MAX_MS);
}

interface UseTerminalSocketOptions {
  tabId: string;
  termRef: RefObject<Terminal | null>;
  fitAddonRef: RefObject<FitAddon | null>;
  onStatusChange?: (status: ConnectionStatus) => void;
  onProcessExit?: (tabId: string, exitCode: number) => void;
}

export function useTerminalSocket({
  tabId,
  termRef,
  fitAddonRef,
  onStatusChange,
  onProcessExit,
}: UseTerminalSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  const onProcessExitRef = useRef(onProcessExit);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onProcessExitRef.current = onProcessExit;
  }, [onStatusChange, onProcessExit]);

  const send = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const sendInput = useCallback((data: string) => send({ type: "input", data }), [send]);
  const sendResize = useCallback(
    (cols: number, rows: number) => send({ type: "resize", cols, rows }),
    [send],
  );
  const sendRefresh = useCallback(() => send({ type: "refresh" }), [send]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: connect once per tabId; refs are stable
  useEffect(() => {
    let isDisposed = false;
    let reconnectAttempts = 0;
    let shouldReconnect = true;
    let reconnectTimer: number | NodeJS.Timeout | undefined;
    let heartbeatTimer: number | NodeJS.Timeout | undefined;
    let pongTimeoutTimer: number | NodeJS.Timeout | undefined;

    const updateStatus = (status: ConnectionStatus) => onStatusChangeRef.current?.(status);

    const clearPongTimeout = () => {
      if (pongTimeoutTimer !== undefined) {
        clearTimeout(pongTimeoutTimer);
        pongTimeoutTimer = undefined;
      }
    };

    const sendPing = (ws: WebSocket) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "ping" }));
      if (pongTimeoutTimer === undefined) {
        pongTimeoutTimer = setTimeout(() => {
          pongTimeoutTimer = undefined;
          if (!isDisposed && wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            console.warn("[ws] Heartbeat timeout, reconnecting...");
            ws.close();
          }
        }, PONG_TIMEOUT_MS);
      }
    };

    function connect() {
      if (isDisposed) return;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      clearPongTimeout();
      updateStatus(reconnectAttempts > 0 ? "reconnecting" : "connecting");

      try {
        fitAddonRef.current?.fit();
      } catch {}

      const cols = termRef.current?.cols || 80;
      const rows = termRef.current?.rows || 24;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?tabId=${encodeURIComponent(tabId)}&cols=${cols}&rows=${rows}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isDisposed || wsRef.current !== ws) {
          ws.close();
          return;
        }
        reconnectAttempts = 0;
        updateStatus("connected");

        try {
          fitAddonRef.current?.fit();
          ws.send(
            JSON.stringify({
              type: "resize",
              cols: termRef.current?.cols,
              rows: termRef.current?.rows,
            }),
          );
          ws.send(JSON.stringify({ type: "refresh" }));
        } catch {}

        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => sendPing(ws), HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        if (isDisposed || wsRef.current !== ws) return;
        clearPongTimeout();
        const term = termRef.current;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            term?.write(msg.data);
          } else if (msg.type === "pong") {
            // Heartbeat ACK
          } else if (msg.type === "exit") {
            const exitCode = typeof msg.code === "number" ? msg.code : 0;
            term?.writeln(`\r\n\x1b[90m[Process completed with exit code ${exitCode}]\x1b[0m`);
            shouldReconnect = false;
            updateStatus("disconnected");
            onProcessExitRef.current?.(tabId, exitCode);
          }
        } catch {
          // Plain string fallback
          term?.write(event.data);
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        clearInterval(heartbeatTimer);
        clearPongTimeout();
        if (isDisposed) return;

        if (event.code !== 1000 && shouldReconnect) {
          updateStatus("reconnecting");
          const delay = getReconnectDelay(reconnectAttempts);
          reconnectAttempts++;
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, delay);
        } else {
          updateStatus("disconnected");
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        try {
          ws.close();
        } catch {}
      };
    }

    const ensureConnected = () => {
      if (isDisposed || !shouldReconnect) return;
      const ws = wsRef.current;
      if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
        reconnectAttempts = 0;
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        sendPing(ws);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        ensureConnected();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", ensureConnected);

    connect();

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", ensureConnected);
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      clearPongTimeout();
      try {
        wsRef.current?.close(1000, "Tab unmounted");
      } catch {}
    };
  }, [tabId]);

  return { sendInput, sendResize, sendRefresh };
}
