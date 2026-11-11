import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ConflictResolution } from "./types";

interface ConflictDialogProps {
  isOpen: boolean;
  fileName: string;
  remainingCount?: number;
  onResolve: (resolution: ConflictResolution) => void;
  onCancel: () => void;
}

export function ConflictDialog({
  isOpen,
  fileName,
  remainingCount = 0,
  onResolve,
  onCancel,
}: ConflictDialogProps) {
  const [applyToAll, setApplyToAll] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-lg shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-base)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
          <div className="p-2 rounded-full bg-[var(--warning)]/20 text-[var(--warning)]">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base">File Already Exists</h3>
            <p className="text-xs text-[var(--fg-muted)]">Upload conflict detected</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-sm">
            <span className="font-mono font-medium text-[var(--accent)] break-all">{fileName}</span>{" "}
            already exists in the destination folder.
          </p>

          {remainingCount > 1 && (
            <label className="flex items-center gap-2 text-xs text-[var(--fg-muted)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="rounded border-[var(--border-subtle)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              Apply to all remaining conflicts ({remainingCount})
            </label>
          )}
        </div>

        <div className="p-3 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] flex justify-end items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onResolve({ action: "skip", applyToAll })}
            className="px-3 py-1.5 rounded text-xs font-medium border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={() => onResolve({ action: "overwrite", applyToAll })}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:brightness-110 transition-colors"
          >
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}
