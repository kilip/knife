import { Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { clampPopoverPosition, UrlActionPopover } from "~/features/terminal/UrlActionPopover";
import { type ConnectionStatus, useTerminalSocket } from "~/features/terminal/useTerminalSocket";
import { useXterm, type XtermOptions } from "~/features/terminal/useXterm";

export type { ConnectionStatus };

export interface TerminalActions {
  sendInput: (data: string) => void;
  getSelection: () => string;
  hasSelection: () => boolean;
  clearSelection: () => void;
  focus: () => void;
}

interface TerminalTabProps extends XtermOptions {
  tabId: string;
  isActive: boolean;
  onProcessExit?: (tabId: string, exitCode: number) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onUploadToCwd?: (files: File[]) => void;
  onRegisterActions?: (tabId: string, actions: TerminalActions | null) => void;
  onRegisterInput?: (tabId: string, sendInput: ((data: string) => void) | null) => void;
}

export function TerminalTab({
  tabId,
  isActive,
  onProcessExit,
  onStatusChange,
  onUploadToCwd,
  onRegisterActions,
  onRegisterInput,
  ...xtermOptions
}: TerminalTabProps) {
  const { theme } = xtermOptions;
  const containerRef = useRef<HTMLDivElement>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [isDragOver, setIsDragOver] = useState(false);
  const [linkPopover, setLinkPopover] = useState<{ url: string; left: number; top: number } | null>(
    null,
  );
  const dragCounterRef = useRef(0);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
    onStatusChangeRef.current?.(status);
  }, []);

  // xterm callbacks are bound to the socket below (declared after xterm so the
  // terminal exists before the socket connects).
  const socketRef = useRef<ReturnType<typeof useTerminalSocket> | null>(null);
  const handleLinkClick = useCallback((url: string, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { left, top } = clampPopoverPosition(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    );
    setLinkPopover({ url, left, top });
  }, []);
  const handleLinkDismiss = useCallback(() => {
    setLinkPopover(null);
  }, []);
  const { termRef, fitAddonRef } = useXterm({
    ...xtermOptions,
    tabId,
    isActive,
    containerRef,
    onData: (data) => {
      setLinkPopover(null);
      socketRef.current?.sendInput(data);
    },
    onResize: (cols, rows) => socketRef.current?.sendResize(cols, rows),
    onRefresh: () => socketRef.current?.sendRefresh(),
    onLinkClick: handleLinkClick,
    onLinkDismiss: handleLinkDismiss,
  });
  const closeLinkPopover = useCallback(() => {
    setLinkPopover(null);
    termRef.current?.focus();
  }, [termRef]);
  const socket = useTerminalSocket({
    tabId,
    termRef,
    fitAddonRef,
    onStatusChange: handleStatusChange,
    onProcessExit,
  });
  socketRef.current = socket;
  const { sendInput } = socket;

  useEffect(() => {
    const send = (data: string) => {
      sendInput(data);
      termRef.current?.focus();
    };
    if (onRegisterActions) {
      onRegisterActions(tabId, {
        sendInput: send,
        getSelection: () => termRef.current?.getSelection() || "",
        hasSelection: () => Boolean(termRef.current?.hasSelection()),
        clearSelection: () => termRef.current?.clearSelection(),
        focus: () => termRef.current?.focus(),
      });
      return () => onRegisterActions(tabId, null);
    }
    if (onRegisterInput) {
      onRegisterInput(tabId, send);
      return () => onRegisterInput(tabId, null);
    }
  }, [tabId, onRegisterActions, onRegisterInput, sendInput, termRef]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
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
      sendInput(`'${customPath.replace(/'/g, `'\\''`)}' `);
      termRef.current?.focus();
      return;
    }

    // Case 2: External OS desktop file drop
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadToCwd?.(Array.from(e.dataTransfer.files));
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop file upload container
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`h-full w-full relative ${isActive ? "block" : "hidden"}`}
      style={{ backgroundColor: theme.ui.bgBase }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {linkPopover && (
        <UrlActionPopover
          url={linkPopover.url}
          left={linkPopover.left}
          top={linkPopover.top}
          onClose={closeLinkPopover}
        />
      )}
      {(connectionStatus === "connecting" || connectionStatus === "reconnecting") && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--bg-base)]/75 backdrop-blur-xs pointer-events-none">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)]/95 shadow-lg text-xs font-medium text-[var(--fg-base)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            <span>
              {connectionStatus === "reconnecting"
                ? "Reconnecting to server..."
                : "Connecting to server..."}
            </span>
          </div>
        </div>
      )}
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
