import React, { useCallback } from "react";
import { ArrowUp, ArrowDown, ChevronDown } from "lucide-react";

export interface QuickKeysBarProps {
  onEsc: () => void;
  onTab: () => void;
  onCtrlC: () => void;
  onCtrlV: () => void;
  onArrowUp: () => void;
  onArrowDown: () => void;
  onClose?: () => void;
}

export function QuickKeysBar({
  onEsc,
  onTab,
  onCtrlC,
  onCtrlV,
  onArrowUp,
  onArrowDown,
  onClose,
}: QuickKeysBarProps) {
  const triggerAction = useCallback(
    (action: () => void) => (e: React.MouseEvent) => {
      e.preventDefault();
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(10);
        } catch {}
      }
      action();
    },
    [],
  );

  return (
    <div
      role="toolbar"
      aria-label="Quick Terminal Keys"
      className="shrink-0 flex items-center justify-between px-2 py-1 bg-[var(--bg-surface)] border-t border-[var(--border)] select-none z-10 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerAction(onEsc)}
          className="h-7.5 px-2.5 rounded-md text-xs font-mono font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)] active:bg-[var(--accent)] active:text-white transition-colors cursor-pointer select-none shrink-0 flex items-center justify-center shadow-xs"
          title="Escape (Esc)"
        >
          ESC
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerAction(onTab)}
          className="h-7.5 px-2.5 rounded-md text-xs font-mono font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)] active:bg-[var(--accent)] active:text-white transition-colors cursor-pointer select-none shrink-0 flex items-center justify-center shadow-xs"
          title="Tab (Autocompletion)"
        >
          TAB
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerAction(onCtrlC)}
          className="h-7.5 px-2.5 rounded-md text-xs font-mono font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)] active:bg-[var(--accent)] active:text-white transition-colors cursor-pointer select-none shrink-0 flex items-center justify-center shadow-xs"
          title="Interrupt / Copy (Ctrl+C)"
        >
          Ctrl+C
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerAction(onCtrlV)}
          className="h-7.5 px-2.5 rounded-md text-xs font-mono font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)] active:bg-[var(--accent)] active:text-white transition-colors cursor-pointer select-none shrink-0 flex items-center justify-center shadow-xs"
          title="Paste Clipboard (Ctrl+V)"
        >
          Ctrl+V
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerAction(onArrowUp)}
          className="h-7.5 px-2 rounded-md text-xs font-mono font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)] active:bg-[var(--accent)] active:text-white transition-colors cursor-pointer select-none shrink-0 flex items-center justify-center shadow-xs"
          title="Previous Command (Up)"
          aria-label="Previous Command"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={triggerAction(onArrowDown)}
          className="h-7.5 px-2 rounded-md text-xs font-mono font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-hover)] active:bg-[var(--accent)] active:text-white transition-colors cursor-pointer select-none shrink-0 flex items-center justify-center shadow-xs"
          title="Next Command (Down)"
          aria-label="Next Command"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {onClose && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClose}
          className="h-7.5 px-1.5 rounded-md text-xs text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0 ml-1 flex items-center justify-center"
          title="Hide Quick Keys Bar"
          aria-label="Hide Quick Keys Bar"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
