import { useRef, useEffect, useState } from "react";
import {
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Copy,
  Check,
  ArrowUpCircle,
  Server,
  Layers,
  AlertCircle,
} from "lucide-react";
import type { UpdateInfo, UpdateStatus } from "~/hooks/useSelfUpdate";

interface SelfUpdateModalProps {
  isOpen: boolean;
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  logs: string[];
  error: string | null;
  remediationCommand: string;
  reconnectCountdown: number;
  onClose: () => void;
  onApplyUpdate: () => void;
  onCheckForUpdate: (force?: boolean) => void;
}

export function SelfUpdateModal({
  isOpen,
  status,
  updateInfo,
  logs,
  error,
  remediationCommand,
  reconnectCountdown,
  onClose,
  onApplyUpdate,
  onCheckForUpdate,
}: SelfUpdateModalProps) {
  const terminalLogRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Auto-scroll logs
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  const isUpdating = status === "updating";
  const isRestarting = status === "restarting";
  const isBusy = isUpdating || isRestarting;

  const handleCopyCommand = () => {
    if (!remediationCommand) return;
    navigator.clipboard.writeText(remediationCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-2xl text-[var(--fg-base)] flex flex-col gap-4 animate-in zoom-in-95 duration-150 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="font-semibold text-base">Host Daemon Update</h3>
          </div>
          {!isBusy && (
            <button
              onClick={onClose}
              className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex flex-col gap-4 overflow-y-auto pr-1">
          {/* Version details card */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">Current Version</span>
              <span className="font-mono font-medium">v{updateInfo?.currentVersion || "..."}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">Latest Version</span>
              <span className="font-mono font-medium text-[var(--accent)]">
                v{updateInfo?.latestVersion || "..."}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--fg-muted)]">Mode / Service</span>
              <span className="flex items-center gap-1 font-mono">
                <Server className="w-3 h-3 text-[var(--fg-muted)]" />
                {updateInfo?.isService ? "OS Service (Auto-restarts)" : "Direct daemon"}
              </span>
            </div>
          </div>

          {/* Status badge / banner */}
          {status === "checking" && (
            <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)] p-2 rounded bg-[var(--bg-surface)] border border-[var(--border)]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
              Checking npm registry for updates...
            </div>
          )}

          {status === "up-to-date" && (
            <div className="flex items-center gap-2 text-xs text-[var(--status-ok)] p-2.5 rounded bg-[var(--status-ok)]/10 border border-[var(--status-ok)]/20">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Knife is up to date! You are running the latest version.</span>
            </div>
          )}

          {/* Terminal Tabs Warning */}
          {updateInfo?.updateAvailable && !isRestarting && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/90 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Active Terminal Sessions ({updateInfo.activeTabsCount})</span>
              </div>
              <p className="leading-relaxed">
                {updateInfo.isTmux ? (
                  <span>
                    <strong>tmux is active:</strong> Background shell sessions and running commands
                    will be preserved across the restart. Tabs will automatically reconnect.
                  </span>
                ) : (
                  <span>
                    <strong>Direct shell mode:</strong> Active terminal sessions may be terminated
                    when the daemon restarts. Please save your work first.
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Error Alert with manual command */}
          {error && (
            <div className="rounded-lg border border-[var(--status-err)]/20 bg-[var(--status-err)]/10 p-3 text-xs text-[var(--status-err)] flex flex-col gap-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Update Failed</span>
              </div>
              <p>{error}</p>
              {remediationCommand && (
                <div className="mt-1 flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--fg-muted)]">
                    You can run the update manually in your terminal:
                  </span>
                  <div className="flex items-center justify-between gap-2 p-1.5 bg-black/40 rounded border border-[var(--border)] font-mono text-[11px]">
                    <span className="truncate">{remediationCommand}</span>
                    <button
                      type="button"
                      onClick={handleCopyCommand}
                      className="p-1 rounded hover:bg-white/10 text-white/80 transition-colors shrink-0"
                      title="Copy command"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Restarting Progress Box */}
          {isRestarting && (
            <div className="rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-4 text-xs flex flex-col items-center gap-2 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--accent)]" />
              <div className="font-semibold text-sm">Server Restarting...</div>
              <p className="text-[var(--fg-muted)]">
                Waiting for the host daemon to restart and come back online.
              </p>
              {reconnectCountdown > 0 && (
                <div className="text-[11px] font-mono text-[var(--fg-muted)]">
                  Polling health check (timeout {reconnectCountdown}s)...
                </div>
              )}
            </div>
          )}

          {/* Real-time Streaming Terminal Log */}
          {(isUpdating || logs.length > 0) && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
                <span className="flex items-center gap-1">
                  <Terminal className="w-3 h-3" />
                  Update Logs
                </span>
                {isUpdating && (
                  <span className="animate-pulse text-[var(--accent)]">Running...</span>
                )}
              </div>
              <div
                ref={terminalLogRef}
                className="w-full h-36 rounded-lg bg-black/60 border border-[var(--border)] p-2.5 font-mono text-[11px] overflow-y-auto space-y-1 text-neutral-300 leading-relaxed scrollbar-thin"
              >
                {logs.map((log, idx) => (
                  <div key={idx} className="break-all whitespace-pre-wrap">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
          <div>
            {!isBusy && (
              <button
                type="button"
                onClick={() => onCheckForUpdate(true)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Check Again
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isBusy && (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-xs text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                Close
              </button>
            )}
            {updateInfo?.updateAvailable && !isBusy && (
              <button
                type="button"
                onClick={onApplyUpdate}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                Update to v{updateInfo.latestVersion}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
