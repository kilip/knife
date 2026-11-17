import type { FitAddon } from "@xterm/addon-fit";
import type { Terminal } from "@xterm/xterm";
import { type RefObject, useCallback, useEffect, useRef } from "react";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

const RECONNECT_BASE_MS = 1000;
const RECONNECT_FACTOR = 1.5;
const RECONNECT_MAX_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HEARTBEAT_TIMEOUT_MS = 45000;

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

    const updateStatus = (status: ConnectionStatus) => onStatusChangeRef.current?.(status);

    function connect() {
      if (isDisposed) return;
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

      let lastMessageTime = Date.now();

      ws.onopen = () => {
        if (isDisposed) {
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
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
            if (Date.now() - lastMessageTime > HEARTBEAT_TIMEOUT_MS) {
              console.warn("[ws] Heartbeat timeout, reconnecting...");
              ws.close();
            }
          }
        }, HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        lastMessageTime = Date.now();
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
        clearInterval(heartbeatTimer);
        if (isDisposed) return;

        if (event.code !== 1000 && shouldReconnect) {
          const delay = getReconnectDelay(reconnectAttempts);
          reconnectAttempts++;
          reconnectTimer = setTimeout(connect, delay);
        } else {
          updateStatus("disconnected");
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    }

    connect();

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      try {
        wsRef.current?.close(1000, "Tab unmounted");
      } catch {}
    };
  }, [tabId]);

  return { sendInput, sendResize, sendRefresh };
}
