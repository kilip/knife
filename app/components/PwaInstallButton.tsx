import { Download } from "lucide-react";

interface PwaInstallButtonProps {
  onInstall: () => void;
}

export function PwaInstallButton({ onInstall }: PwaInstallButtonProps) {
  return (
    <button
      onClick={onInstall}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-[var(--border)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--fg-base)] transition-colors cursor-pointer select-none"
      title="Install Knife as standalone desktop/mobile app"
    >
      <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
      <span>Install</span>
    </button>
  );
}
