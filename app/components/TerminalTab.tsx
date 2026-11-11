import { useState, useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { Upload } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import { type KnifeTheme } from "~/utils/themes";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface TerminalActions {
  sendInput: (data: string) => void;
  getSelection: () => string;
  hasSelection: () => boolean;
  clearSelection: () => void;
  focus: () => void;
}

interface TerminalTabProps {
  tabId: string;
  isActive: boolean;
  theme: KnifeTheme;
  fontSize?: number;
  onStatusChange?: (status: ConnectionStatus) => void;
  onUploadToCwd?: (files: File[]) => void;
  onRegisterActions?: (tabId: string, actions: TerminalActions | null) => void;
  onRegisterInput?: (tabId: string, sendInput: ((data: string) => void) | null) => void;
}

export function TerminalTab({
  tabId,
  isActive,
  theme,
  fontSize,
  onStatusChange,
  onUploadToCwd,
  onRegisterActions,
  onRegisterInput,
}: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const statusRef = useRef<ConnectionStatus>("connecting");

  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    if (onRegisterActions) {
      const actions: TerminalActions = {
        sendInput: (data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "input", data }));
          }
          termRef.current?.focus();
        },
        getSelection: () => termRef.current?.getSelection() || "",
        hasSelection: () => Boolean(termRef.current?.hasSelection()),
        clearSelection: () => termRef.current?.clearSelection(),
        focus: () => termRef.current?.focus(),
      };
      onRegisterActions(tabId, actions);
      return () => {
        onRegisterActions(tabId, null);
      };
    } else if (onRegisterInput) {
      onRegisterInput(tabId, (data: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "input", data }));
        }
        termRef.current?.focus();
      });
      return () => {
        onRegisterInput(tabId, null);
      };
    }
  }, [tabId, onRegisterActions, onRegisterInput]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      setIsDragOver(false);
      dragCounterRef.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    dragCounterRef.current = 0;

    // Case 1: Internal drag from file browser
    const customPath = e.dataTransfer.getData("application/x-knife-file-path");
    if (customPath) {
      const escaped = `'${customPath.replace(/'/g, `'\\''`)}' `;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data: escaped }));
      }
      termRef.current?.focus();
      return;
    }

    // Case 2: External OS desktop file drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onUploadToCwd?.(files);
    }
  };
  // Keep latest onStatusChange callback ref
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  // Keep latest isActive ref for observers and callbacks
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Sync font size changes to xterm.js instance
  useEffect(() => {
    if (termRef.current && fontSize && termRef.current.options.fontSize !== fontSize) {
      termRef.current.options.fontSize = fontSize;
      try {
        fitAddonRef.current?.fit();
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        if (cols && rows && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
        }
      } catch {}
    }
  }, [fontSize]);

  const updateStatus = (newStatus: ConnectionStatus) => {
    statusRef.current = newStatus;
    onStatusChangeRef.current?.(newStatus);
  };

  // Sync theme changes to xterm.js instance
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme.terminal;
    }
  }, [theme]);

  // When tab becomes active, trigger fit, focus, and refresh
  useEffect(() => {
    if (isActive && termRef.current && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          termRef.current?.focus();
          const cols = termRef.current?.cols;
          const rows = termRef.current?.rows;
          if (cols && rows && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
            wsRef.current.send(JSON.stringify({ type: "refresh" }));
          }
        } catch {}
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isActive]);

  useEffect(() => {
    if (!containerRef.current) return;

    let isDisposed = false;
    let reconnectAttempts = 0;
    let shouldReconnect = true;
    let reconnectTimer: number | NodeJS.Timeout | undefined;
    let heartbeatTimer: number | NodeJS.Timeout | undefined;
    let resizeDebounceTimer: number | NodeJS.Timeout | undefined;

    // 1. Initialize Terminal
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: "block",
      fontSize: fontSize ?? 15,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      theme: theme.terminal,
      allowProposedApi: true,
      scrollback: 50000,
    });
    termRef.current = term;

    // 2. Load Addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(webLinksAddon);

    const unicode11Addon = new Unicode11Addon();
    term.loadAddon(unicode11Addon);
    term.unicode.activeVersion = "11";

    term.open(containerRef.current);

    // 3. Renderer with Fallback: WebGL -> Canvas -> DOM
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      try {
        const canvasAddon = new CanvasAddon();
        term.loadAddon(canvasAddon);
      } catch {
        // Fallback to default DOM renderer
      }
    }

    // 4. OSC 52 Clipboard handler
    term.parser.registerOscHandler(52, (data) => {
      // OSC 52 syntax: Pc;Pd where Pd is base64 encoded clipboard content
      const parts = data.split(";");
      if (parts.length >= 2) {
        const base64Content = parts.slice(1).join(";");
        try {
          const decoded = atob(base64Content);
          navigator.clipboard?.writeText(decoded).catch(() => {});
        } catch {}
      }
      return true;
    });
    // Let app shortcuts pass through
    term.attachCustomKeyEventHandler((e) => {
      if (
        e.altKey &&
        (e.key === "t" ||
          e.key === "T" ||
          e.key === "w" ||
          e.key === "W" ||
          e.key === "f" ||
          e.key === "F" ||
          /^[1-9]$/.test(e.key) ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight")
      ) {
        return false;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "=" ||
          e.key === "+" ||
          e.key === "-" ||
          e.key === "0" ||
          e.key === "e" ||
          e.key === "E")
      ) {
        return false;
      }
      // Smart Ctrl+C: If text is selected in xterm, copy to clipboard on keydown instead of sending SIGINT
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && e.type === "keydown") {
        if (term.hasSelection()) {
          const selectedText = term.getSelection();
          if (selectedText) {
            navigator.clipboard?.writeText(selectedText).catch(() => {});
          }
          return false;
        }
      }
      return true;
    });

    // 5. Connect WebSocket with auto-reconnect & exponential backoff
    function connect() {
      if (isDisposed) return;

      if (reconnectAttempts > 0) {
        updateStatus("reconnecting");
      } else {
        updateStatus("connecting");
      }

      try {
        fitAddon.fit();
      } catch {}

      const initialCols = term.cols || 80;
      const initialRows = term.rows || 24;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/terminal?tabId=${encodeURIComponent(tabId)}&cols=${initialCols}&rows=${initialRows}`;
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

        // Fit & notify backend of terminal dimensions
        try {
          fitAddon.fit();
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
          ws.send(JSON.stringify({ type: "refresh" }));
        } catch {}

        // Setup application heartbeat (every 15s)
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
            // If connection hasn't received anything in 45s, force reconnect
            if (Date.now() - lastMessageTime > 45000) {
              console.warn("[ws] Heartbeat timeout, reconnecting...");
              ws.close();
            }
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        lastMessageTime = Date.now();
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "output") {
            term.write(msg.data);
          } else if (msg.type === "pong") {
            // Heartbeat ACK
          } else if (msg.type === "exit") {
            const exitCode = typeof msg.code === "number" ? msg.code : 0;
            term.writeln(`\r\n\x1b[90m[Process completed with exit code ${exitCode}]\x1b[0m`);
            shouldReconnect = false;
            updateStatus("disconnected");
          }
        } catch {
          // Plain string fallback
          term.write(event.data);
        }
      };

      ws.onclose = (event) => {
        clearInterval(heartbeatTimer);
        if (isDisposed) return;

        // If not intentional client close (code 1000) and shell did not cleanly exit
        if (event.code !== 1000 && shouldReconnect) {
          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
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

    // 6. Forward user terminal input to WebSocket
    const onDataDisposable = term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    // 7. Debounced window / container ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        try {
          fitAddon.fit();
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: "resize",
                cols: term.cols,
                rows: term.rows,
              }),
            );
          }
        } catch {}
      }, 80);
    });

    resizeObserver.observe(containerRef.current);

    // Initial fit
    setTimeout(() => {
      try {
        fitAddon.fit();
        term.focus();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "resize",
              cols: term.cols,
              rows: term.rows,
            }),
          );
        }
      } catch {}
    }, 100);
    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      clearTimeout(resizeDebounceTimer);
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      try {
        wsRef.current?.close(1000, "Tab unmounted");
      } catch {}
      try {
        term.dispose();
      } catch {}
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tabId]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`h-full w-full relative ${isActive ? "block" : "hidden"}`}
      style={{ backgroundColor: theme.ui.bgBase }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {isDragOver && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[var(--accent)]/15 border-2 border-dashed border-[var(--accent)] backdrop-blur-xs pointer-events-none">
          <Upload className="w-12 h-12 text-[var(--accent)] animate-bounce mb-2" />
          <p className="font-semibold text-sm text-[var(--fg-base)]">
            Drop files to upload into active tab directory
          </p>
        </div>
      )}
    </div>
  );
}
