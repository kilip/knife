import { Sparkles, RefreshCw, X } from "lucide-react";

interface PwaUpdateToastProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function PwaUpdateToast({ onUpdate, onDismiss }: PwaUpdateToastProps) {
  return (
    <aside
      aria-label="Update notification"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--fg-base)] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[var(--accent)]" />
        <span className="text-xs font-mono">New version of knife is ready</span>
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <button
          onClick={onUpdate}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-90 transition-opacity cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          <span>Update</span>
        </button>
        <button
          onClick={onDismiss}
          className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors cursor-pointer rounded"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
