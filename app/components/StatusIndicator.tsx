import type { ConnectionStatus } from "./TerminalTab";

interface StatusIndicatorProps {
  status?: ConnectionStatus;
  className?: string;
}

export function StatusIndicator({ status = "connected", className = "" }: StatusIndicatorProps) {
  let color = "bg-[var(--status-ok)]";
  let label = "Connected";
  let pulse = false;

  if (status === "connecting") {
    color = "bg-[var(--status-warn)]";
    label = "Connecting...";
    pulse = true;
  } else if (status === "reconnecting") {
    color = "bg-[var(--status-warn)]";
    label = "Reconnecting...";
    pulse = true;
  } else if (status === "disconnected") {
    color = "bg-[var(--status-err)]";
    label = "Disconnected";
    pulse = false;
  }

  return (
    <span
      className={`inline-flex items-center justify-center title="${label}" ${className}`}
      title={label}
    >
      <span className={`w-2 h-2 rounded-full ${color} ${pulse ? "animate-pulse" : ""}`} />
    </span>
  );
}
