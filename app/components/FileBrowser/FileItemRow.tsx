import { useState, useRef, useEffect } from "react";
import { Folder, FileText, Image, File, MoreVertical } from "lucide-react";
import type { FsItem } from "./types";

interface FileItemRowProps {
  item: FsItem;
  isSelected: boolean;
  isRenaming: boolean;
  onSelect: (item: FsItem) => void;
  onOpen: (item: FsItem) => void;
  onContextMenu: (e: React.MouseEvent, item: FsItem) => void;
  onSubmitRename: (newName: string) => void;
  onCancelRename: () => void;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatFileDate(ms: number): string {
  if (!ms) return "--";
  const date = new Date(ms);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getItemIcon(item: FsItem) {
  if (item.isDirectory) {
    return <Folder className="w-4 h-4 text-[var(--accent)] shrink-0" />;
  }
  const ext = item.name.includes(".") ? item.name.split(".").pop()?.toLowerCase() : "";
  if (ext && ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext)) {
    return <Image className="w-4 h-4 text-emerald-400 shrink-0" />;
  }
  if (ext && ["ts", "tsx", "js", "jsx", "json", "html", "css", "py", "sh", "md"].includes(ext)) {
    return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  return <File className="w-4 h-4 text-[var(--fg-muted)] shrink-0" />;
}

export function shellEscape(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export function FileItemRow({
  item,
  isSelected,
  isRenaming,
  onSelect,
  onOpen,
  onContextMenu,
  onSubmitRename,
  onCancelRename,
}: FileItemRowProps) {
  const [nameVal, setNameVal] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setNameVal(item.name);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isRenaming, item.name]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (nameVal.trim() && nameVal.trim() !== item.name) {
        onSubmitRename(nameVal.trim());
      } else {
        onCancelRename();
      }
    } else if (e.key === "Escape") {
      onCancelRename();
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", shellEscape(item.path));
    e.dataTransfer.setData("application/x-knife-file-path", item.path);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div
      draggable={!isRenaming}
      onDragStart={handleDragStart}
      onClick={() => onSelect(item)}
      onDoubleClick={() => onOpen(item)}
      onContextMenu={(e) => onContextMenu(e, item)}
      className={`group flex items-center px-2 py-1.5 text-xs select-none cursor-pointer rounded-sm transition-colors ${
        isSelected
          ? "bg-[var(--accent)]/15 text-[var(--fg-base)]"
          : "hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
      }`}
    >
      {/* Icon & Name */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {getItemIcon(item)}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (nameVal.trim() && nameVal.trim() !== item.name) {
                onSubmitRename(nameVal.trim());
              } else {
                onCancelRename();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--accent)] text-[var(--fg-base)] font-mono text-xs w-full outline-hidden"
          />
        ) : (
          <span className="truncate font-mono font-medium">{item.name}</span>
        )}
      </div>

      {/* Size */}
      <div className="w-16 text-right font-mono text-[11px] text-[var(--fg-muted)] shrink-0 hidden sm:block">
        {item.isDirectory ? "--" : formatFileSize(item.size)}
      </div>

      {/* Date */}
      <div className="w-24 text-right font-mono text-[11px] text-[var(--fg-muted)] shrink-0 hidden md:block pl-2">
        {formatFileDate(item.mtime)}
      </div>

      {/* Options button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, item);
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[var(--bg-base)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] ml-1 transition-opacity"
        title="More actions"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
