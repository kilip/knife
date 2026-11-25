import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const POPOVER_PADDING = 8;
const DEFAULT_POPOVER_WIDTH = 280;
const DEFAULT_POPOVER_HEIGHT = 84;
const COPY_RESET_CLOSE_MS = 600;

/** Returns true strictly for http:// or https:// URLs. */
export function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Clamps container-relative popover coordinates within padded container bounds. */
export function clampPopoverPosition(
  x: number,
  y: number,
  containerWidth: number,
  containerHeight: number,
  popoverWidth = DEFAULT_POPOVER_WIDTH,
  popoverHeight = DEFAULT_POPOVER_HEIGHT,
): { left: number; top: number } {
  const maxLeft = Math.max(POPOVER_PADDING, containerWidth - popoverWidth - POPOVER_PADDING);
  const maxTop = Math.max(POPOVER_PADDING, containerHeight - popoverHeight - POPOVER_PADDING);
  return {
    left: Math.min(Math.max(POPOVER_PADDING, x), maxLeft),
    top: Math.min(Math.max(POPOVER_PADDING, y), maxTop),
  };
}

interface UrlActionPopoverProps {
  url: string;
  left: number;
  top: number;
  onClose: () => void;
}

export function UrlActionPopover({ url, left, top, onClose }: UrlActionPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [onClose]);

  if (!isSafeHttpUrl(url)) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopied(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      onClose();
    }, COPY_RESET_CLOSE_MS);
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="URL actions"
      style={{ left, top }}
      className="absolute z-40 w-[280px] max-w-[calc(100%-16px)] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2.5 text-[var(--fg-base)] shadow-2xl"
    >
      <p className="truncate font-mono text-xs text-[var(--fg-muted)] mb-2" title={url}>
        {url}
      </p>
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onClose()}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-90 transition-opacity"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Open</span>
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-base)] hover:bg-[var(--bg-overlay)] transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
