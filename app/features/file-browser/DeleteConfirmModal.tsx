import { AlertCircle } from "lucide-react";
import type { FsItem } from "./types";

interface DeleteConfirmModalProps {
  item: FsItem | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ item, onConfirm, onCancel }: DeleteConfirmModalProps) {
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-lg shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-base)] overflow-hidden p-4 space-y-4">
        <h3 className="font-semibold text-base text-[var(--error)] flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Delete {item.isDirectory ? "Folder" : "File"}
        </h3>
        <p className="text-sm">
          Are you sure you want to permanently delete{" "}
          <span className="font-mono font-medium text-[var(--accent)]">{item.name}</span>?
          {item.isDirectory && " All contents inside will be deleted."}
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--error)] text-white hover:brightness-110"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
