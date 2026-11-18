import { Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // xterm callbacks are bound to the socket below (declared after xterm so the
  // terminal exists before the socket connects).
  const socketRef = useRef<ReturnType<typeof useTerminalSocket> | null>(null);
  const { termRef, fitAddonRef } = useXterm({
    ...xtermOptions,
    tabId,
    isActive,
    containerRef,
    onData: (data) => socketRef.current?.sendInput(data),
    onResize: (cols, rows) => socketRef.current?.sendResize(cols, rows),
    onRefresh: () => socketRef.current?.sendRefresh(),
  });
  const socket = useTerminalSocket({
    tabId,
    termRef,
    fitAddonRef,
    onStatusChange,
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
