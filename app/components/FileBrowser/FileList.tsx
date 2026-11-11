import { ArrowUp, ArrowDown, Folder } from "lucide-react";
import { FileItemRow } from "./FileItemRow";
import type { FsItem, SortField, SortDirection } from "./types";

interface FileListProps {
  items: FsItem[];
  parent: string | null;
  selectedPath: string | null;
  renamingPath: string | null;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;
  onSelect: (item: FsItem) => void;
  onOpen: (item: FsItem) => void;
  onNavigateParent: () => void;
  onContextMenu: (e: React.MouseEvent, item: FsItem) => void;
  onSubmitRename: (newName: string) => void;
  onCancelRename: () => void;
}

export function FileList({
  items,
  parent,
  selectedPath,
  renamingPath,
  sortField,
  sortDirection,
  onSortChange,
  onSelect,
  onOpen,
  onNavigateParent,
  onContextMenu,
  onSubmitRename,
  onCancelRename,
}: FileListProps) {
  // Sort items client-side
  const sortedItems = [...items].sort((a, b) => {
    // Folders always first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    let res = 0;
    if (sortField === "name") {
      res = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    } else if (sortField === "size") {
      res = a.size - b.size;
    } else if (sortField === "mtime") {
      res = a.mtime - b.mtime;
    }
    return sortDirection === "asc" ? res : -res;
  });

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3 h-3 inline-block ml-0.5 text-[var(--accent)]" />
    ) : (
      <ArrowDown className="w-3 h-3 inline-block ml-0.5 text-[var(--accent)]" />
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Table Header */}
      <div className="flex items-center px-2 py-1.5 text-[11px] font-semibold text-[var(--fg-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-base)] select-none">
        <button
          type="button"
          onClick={() => onSortChange("name")}
          className="flex-1 text-left flex items-center hover:text-[var(--fg-base)] transition-colors"
        >
          <span>Name</span>
          {renderSortIndicator("name")}
        </button>

        <button
          type="button"
          onClick={() => onSortChange("size")}
          className="w-16 text-right hidden sm:flex items-center justify-end hover:text-[var(--fg-base)] transition-colors"
        >
          <span>Size</span>
          {renderSortIndicator("size")}
        </button>

        <button
          type="button"
          onClick={() => onSortChange("mtime")}
          className="w-24 text-right hidden md:flex items-center justify-end hover:text-[var(--fg-base)] transition-colors pl-2"
        >
          <span>Modified</span>
          {renderSortIndicator("mtime")}
        </button>
        <div className="w-5" />
      </div>

      {/* Item rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-subtle)]/30 p-1">
        {/* Parent Directory (..) Row */}
        {parent !== null && (
          <div
            onDoubleClick={onNavigateParent}
            onClick={onNavigateParent}
            className="flex items-center px-2 py-1.5 text-xs text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] cursor-pointer rounded-sm select-none"
          >
            <Folder className="w-4 h-4 text-[var(--accent)] mr-2 shrink-0" />
            <span className="font-mono font-medium">..</span>
          </div>
        )}

        {sortedItems.map((item) => (
          <FileItemRow
            key={item.path}
            item={item}
            isSelected={selectedPath === item.path}
            isRenaming={renamingPath === item.path}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onSubmitRename={onSubmitRename}
            onCancelRename={onCancelRename}
          />
        ))}

        {sortedItems.length === 0 && !parent && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-[var(--fg-muted)]">
            <span>Empty directory</span>
          </div>
        )}
      </div>
    </div>
  );
}
