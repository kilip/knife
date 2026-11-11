import { useEffect, useRef } from "react";
import { Download, Terminal, Copy, Edit2, Trash2 } from "lucide-react";
import type { FsItem } from "./types";

interface FileContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  item: FsItem | null;
  onClose: () => void;
  onDownload: (item: FsItem) => void;
  onInsertPath: (item: FsItem) => void;
  onCopyPath: (item: FsItem) => void;
  onRename: (item: FsItem) => void;
  onDelete: (item: FsItem) => void;
}

export function FileContextMenu({
  isOpen,
  position,
  item,
  onClose,
  onDownload,
  onInsertPath,
  onCopyPath,
  onRename,
  onDelete,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  // Prevent menu overflow offscreen
  const menuStyle = {
    top: Math.min(position.y, window.innerHeight - 220),
    left: Math.min(position.x, window.innerWidth - 200),
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="fixed z-50 w-48 rounded-md shadow-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-base)] py-1 text-xs select-none backdrop-blur-md"
    >
      <button
        type="button"
        onClick={() => {
          onDownload(item);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left transition-colors"
      >
        <Download className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
        <span>{item.isDirectory ? "Download as ZIP" : "Download"}</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onInsertPath(item);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left transition-colors"
      >
        <Terminal className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span>Insert Path into Terminal</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onCopyPath(item);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left transition-colors"
      >
        <Copy className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
        <span>Copy Path</span>
      </button>

      <div className="h-[1px] my-1 bg-[var(--border-subtle)]" />

      <button
        type="button"
        onClick={() => {
          onRename(item);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--bg-hover)] text-left transition-colors"
      >
        <Edit2 className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
        <span>Rename</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onDelete(item);
          onClose();
        }}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--error)]/20 text-[var(--error)] text-left transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>Delete</span>
      </button>
    </div>
  );
}
