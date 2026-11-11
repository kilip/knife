import { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  X,
  Upload,
  Download,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { formatFileSize } from "./FileItemRow";
import type { FileTransferItem } from "./types";

interface TransferQueueDrawerProps {
  transfers: FileTransferItem[];
  onCancel: (id: string) => void;
  onClearCompleted: () => void;
}

export function TransferQueueDrawer({
  transfers,
  onCancel,
  onClearCompleted,
}: TransferQueueDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (transfers.length === 0) return null;

  const activeTransfers = transfers.filter(
    (t) => t.status === "transferring" || t.status === "pending",
  );
  const completedTransfers = transfers.filter((t) => t.status === "completed");

  const totalBytes = transfers.reduce((acc, t) => acc + t.size, 0);
  const transferredBytes = transfers.reduce((acc, t) => acc + t.transferred, 0);
  const overallPercentage = totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 sm:w-96 rounded-lg shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-base)] overflow-hidden transition-all duration-200">
      {/* Header bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="px-3 py-2 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {activeTransfers.length > 0 ? (
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
          ) : (
            <Check className="w-4 h-4 text-[var(--success)]" />
          )}
          <span className="font-semibold text-xs">
            {activeTransfers.length > 0
              ? `Transferring ${activeTransfers.length} item${activeTransfers.length > 1 ? "s" : ""}`
              : `All transfers complete`}
          </span>
          <span className="text-[11px] text-[var(--fg-muted)]">
            ({completedTransfers.length}/{transfers.length})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {activeTransfers.length === 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearCompleted();
              }}
              className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] text-[11px]"
              title="Clear Completed"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mini Progress Bar when collapsed */}
      {!isExpanded && activeTransfers.length > 0 && (
        <div className="h-1 bg-[var(--bg-hover)] w-full">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>
      )}

      {/* Expanded Transfer List */}
      {isExpanded && (
        <div className="max-h-60 overflow-y-auto divide-y divide-[var(--border-subtle)]/40 p-2 space-y-2">
          {transfers.map((item) => {
            const percent =
              item.size > 0 ? Math.min(100, Math.round((item.transferred / item.size) * 100)) : 0;
            return (
              <div key={item.id} className="pt-2 first:pt-0">
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    {item.type === "upload" ? (
                      <Upload className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    )}
                    <span className="font-mono truncate font-medium">{item.name}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.status === "transferring" && (
                      <span className="text-[10px] text-[var(--fg-muted)] font-mono">
                        {item.speed > 0 ? `${formatFileSize(item.speed)}/s` : ""}
                      </span>
                    )}
                    {item.status === "completed" && (
                      <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                    )}
                    {item.status === "error" && (
                      <span
                        className="text-[10px] text-[var(--error)] flex items-center gap-1"
                        title={item.error}
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Failed
                      </span>
                    )}
                    {item.status === "cancelled" && (
                      <span className="text-[10px] text-[var(--fg-muted)]">Cancelled</span>
                    )}

                    {(item.status === "pending" || item.status === "transferring") && (
                      <button
                        type="button"
                        onClick={() => onCancel(item.id)}
                        className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--error)] transition-colors"
                        title="Cancel Transfer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 w-full bg-[var(--bg-base)] rounded-full overflow-hidden border border-[var(--border-subtle)]">
                  <div
                    className={`h-full transition-all duration-200 ${
                      item.status === "completed"
                        ? "bg-[var(--success)]"
                        : item.status === "error"
                          ? "bg-[var(--error)]"
                          : "bg-[var(--accent)]"
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-[var(--fg-muted)] mt-0.5 font-mono">
                  <span>
                    {formatFileSize(item.transferred)} / {formatFileSize(item.size)}
                  </span>
                  <span>{percent}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
