import { WifiOff } from "lucide-react";

export function PwaOfflineBanner() {
  return (
    <div className="flex items-center justify-center gap-2 py-1 px-3 bg-[var(--status-warn)]/15 border-b border-[var(--status-warn)]/30 text-[var(--status-warn)] text-xs font-mono select-none">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline mode — Local preferences active, reconnecting terminal when online</span>
    </div>
  );
}
