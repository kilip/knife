import { useState, useEffect, useCallback, useRef } from "react";
import { X, Folder, AlertCircle } from "lucide-react";
import { FileBrowserHeader } from "./FileBrowserHeader";
import { FileList } from "./FileList";
import { FileContextMenu } from "./FileContextMenu";
import { FilePreviewModal } from "./FilePreviewModal";
import { ConflictDialog } from "./ConflictDialog";
import { shellEscape } from "./FileItemRow";
import type { FsItem, SortField, SortDirection, ConflictResolution } from "./types";

interface FileBrowserPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTabId: string;
  onInsertTerminalPath: (path: string) => void;
  onUpload: (
    targetDir: string,
    files: File[] | FileList,
    relativePaths?: string[],
    overwrite?: boolean,
  ) => void;
  onDownloadFile: (path: string, name?: string, size?: number) => void;
  onDownloadArchive: (paths: string[], archiveName?: string) => void;
}

export function FileBrowserPanel({
  isOpen,
  onClose,
  activeTabId,
  onInsertTerminalPath,
  onUpload,
  onDownloadFile,
  onDownloadArchive,
}: FileBrowserPanelProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<FsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingCwd, setIsSyncingCwd] = useState(false);

  // Sorting & Hidden settings
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showHidden, setShowHidden] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("knife_file_browser_hidden") === "true";
    }
    return false;
  });

  // Selection & Renaming state
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    item: FsItem | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    item: null,
  });

  // Modals state
  const [previewItem, setPreviewItem] = useState<FsItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<FsItem | null>(null);

  // Pending upload conflicts queue
  const [conflictQueue, setConflictQueue] = useState<{
    files: File[];
    targetDir: string;
    pendingConflicts: File[];
  } | null>(null);

  // Panel Width (Desktop resizable)
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("knife_file_browser_width");
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 220 && val <= 600) return val;
      }
    }
    return 300;
  });
  const isResizingRef = useRef(false);

  // Load Directory
  const loadDirectory = useCallback(
    async (path?: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/fs/list?path=${encodeURIComponent(path || currentPath || "")}&hidden=${showHidden}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setCurrentPath(data.path);
        setParentPath(data.parent);
        setItems(data.items);
      } catch (err: any) {
        setError(err.message || "Failed to load directory");
      } finally {
        setLoading(false);
      }
    },
    [currentPath, showHidden],
  );

  // Initial load
  useEffect(() => {
    if (isOpen) {
      loadDirectory();
    }
  }, [isOpen, showHidden]);

  // Sync with tab CWD
  const syncWithTabCwd = useCallback(async () => {
    if (!activeTabId) return;
    setIsSyncingCwd(true);
    try {
      const res = await fetch(`/api/tabs/${activeTabId}/cwd`);
      if (res.ok) {
        const data = await res.json();
        if (data.cwd) {
          loadDirectory(data.cwd);
        }
      }
    } catch {
      // Ignored
    } finally {
      setIsSyncingCwd(false);
    }
  }, [activeTabId, loadDirectory]);

  // Keyboard shortcut Ctrl+H for hidden files toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setShowHidden((prev) => {
          const next = !prev;
          localStorage.setItem("knife_file_browser_hidden", String(next));
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Panel resize drag handling
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = Math.max(220, Math.min(600, moveEvent.clientX));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setPanelWidth((w) => {
        localStorage.setItem("knife_file_browser_width", String(w));
        return w;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Actions
  const handleNavigate = (path: string) => {
    setSelectedPath(null);
    setRenamingPath(null);
    loadDirectory(path);
  };

  const handleNavigateParent = () => {
    if (parentPath) {
      handleNavigate(parentPath);
    }
  };

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleCreateFile = async () => {
    const name = window.prompt("Enter new file name:");
    if (!name || !name.trim()) return;
    try {
      const res = await fetch("/api/fs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "touch", parent: currentPath, name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create file");
      } else {
        loadDirectory(currentPath);
      }
    } catch (err: any) {
      alert(err.message || "Failed to create file");
    }
  };

  const handleCreateFolder = async () => {
    const name = window.prompt("Enter new folder name:");
    if (!name || !name.trim()) return;
    try {
      const res = await fetch("/api/fs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mkdir", parent: currentPath, name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to create folder");
      } else {
        loadDirectory(currentPath);
      }
    } catch (err: any) {
      alert(err.message || "Failed to create folder");
    }
  };

  const handleRenameSubmit = async (newName: string) => {
    if (!renamingPath) return;
    try {
      const res = await fetch("/api/fs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", path: renamingPath, name: newName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to rename");
      } else {
        loadDirectory(currentPath);
      }
    } catch (err: any) {
      alert(err.message || "Failed to rename");
    } finally {
      setRenamingPath(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    try {
      const res = await fetch("/api/fs/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", paths: [itemToDelete.path] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to delete");
      } else {
        loadDirectory(currentPath);
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    } finally {
      setItemToDelete(null);
    }
  };

  const handleOpenItem = (item: FsItem) => {
    if (item.isDirectory) {
      handleNavigate(item.path);
    } else {
      setPreviewItem(item);
    }
  };

  const handleContextMenuTrigger = (e: React.MouseEvent, item: FsItem) => {
    e.preventDefault();
    setSelectedPath(item.path);
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      item,
    });
  };

  // Upload dispatch with collision handling
  const handleQueueUpload = (fileList: File[] | FileList, relativePaths?: string[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Detect existing collisions
    const existingNames = new Set(items.map((i) => i.name));
    const conflicts = files.filter((f) => existingNames.has(f.name));

    if (conflicts.length > 0) {
      setConflictQueue({
        files,
        targetDir: currentPath,
        pendingConflicts: conflicts,
      });
    } else {
      onUpload(currentPath, files, relativePaths, true);
    }
  };

  const handleConflictResolve = (resolution: ConflictResolution) => {
    if (!conflictQueue) return;
    const { files, targetDir } = conflictQueue;
    const overwrite = resolution.action === "overwrite";
    onUpload(targetDir, files, undefined, overwrite);
    setConflictQueue(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden"
        onClick={onClose}
      />

      {/* Main Container: Split pane on desktop, slide-over drawer on mobile */}
      <aside
        style={{ width: `${panelWidth}px` }}
        className="fixed inset-y-0 left-0 z-40 md:static flex flex-col h-full bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] shadow-xl md:shadow-none select-none transition-[width] duration-75"
      >
        {/* Top Header */}
        <div className="px-3 py-2 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-[var(--accent)]" />
            <span className="font-semibold text-xs tracking-wider uppercase">File Manager</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] transition-colors"
            title="Close sidebar (Ctrl+E)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Browser Header / Breadcrumbs / Actions */}
        <FileBrowserHeader
          currentPath={currentPath}
          canNavigateParent={Boolean(parentPath)}
          showHidden={showHidden}
          isSyncing={isSyncingCwd}
          onNavigate={handleNavigate}
          onNavigateParent={handleNavigateParent}
          onRefresh={() => loadDirectory(currentPath)}
          onSyncCwd={syncWithTabCwd}
          onCreateFolder={handleCreateFolder}
          onCreateFile={handleCreateFile}
          onUploadFiles={(files) => handleQueueUpload(files)}
          onUploadFolder={(files) => {
            const relPaths = Array.from(files).map((f) => f.webkitRelativePath || f.name);
            handleQueueUpload(files, relPaths);
          }}
          onToggleHidden={() => {
            setShowHidden((prev) => {
              const next = !prev;
              localStorage.setItem("knife_file_browser_hidden", String(next));
              return next;
            });
          }}
        />

        {/* Content list or loading / error states */}
        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-xs text-[var(--fg-muted)] gap-2">
            <AlertCircle className="w-8 h-8 text-[var(--error)]" />
            <span className="font-medium text-[var(--fg-base)]">Error accessing directory</span>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadDirectory(parentPath || "/")}
              className="mt-2 px-3 py-1 rounded bg-[var(--accent)] text-white text-xs font-medium"
            >
              Go to Parent
            </button>
          </div>
        ) : (
          <FileList
            items={items}
            parent={parentPath}
            selectedPath={selectedPath}
            renamingPath={renamingPath}
            sortField={sortField}
            sortDirection={sortDirection}
            onSortChange={handleSortChange}
            onSelect={(item) => setSelectedPath(item.path)}
            onOpen={handleOpenItem}
            onNavigateParent={handleNavigateParent}
            onContextMenu={handleContextMenuTrigger}
            onSubmitRename={handleRenameSubmit}
            onCancelRename={() => setRenamingPath(null)}
          />
        )}

        {/* Footer info bar */}
        <div className="px-3 py-1.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--fg-muted)] bg-[var(--bg-base)] flex justify-between">
          <span>
            {loading ? "Loading..." : `${items.length} item${items.length === 1 ? "" : "s"}`}
          </span>
          <span>{showHidden ? "Hidden shown" : "Hidden hidden"}</span>
        </div>

        {/* Desktop Split-Pane Resize Handle */}
        <div
          onMouseDown={handleMouseDownResize}
          className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors z-50"
        />
      </aside>

      {/* Context Menu */}
      <FileContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        item={contextMenu.item}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onDownload={(item) => {
          if (item.isDirectory) {
            onDownloadArchive([item.path], `${item.name}.zip`);
          } else {
            onDownloadFile(item.path, item.name, item.size);
          }
        }}
        onInsertPath={(item) => {
          onInsertTerminalPath(shellEscape(item.path));
        }}
        onCopyPath={(item) => {
          navigator.clipboard.writeText(item.path);
        }}
        onRename={(item) => {
          setRenamingPath(item.path);
        }}
        onDelete={(item) => {
          setItemToDelete(item);
        }}
      />

      {/* Quick Preview Modal */}
      <FilePreviewModal
        isOpen={Boolean(previewItem)}
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onDownload={(item) => onDownloadFile(item.path, item.name, item.size)}
      />
      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-lg shadow-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--fg-base)] overflow-hidden p-4 space-y-4">
            <h3 className="font-semibold text-base text-[var(--error)] flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete {itemToDelete.isDirectory ? "Folder" : "File"}
            </h3>
            <p className="text-sm">
              Are you sure you want to permanently delete{" "}
              <span className="font-mono font-medium text-[var(--accent)]">
                {itemToDelete.name}
              </span>
              ?{itemToDelete.isDirectory && " All contents inside will be deleted."}
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 rounded text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 rounded text-xs font-medium bg-[var(--error)] text-white hover:brightness-110"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Dialog */}
      <ConflictDialog
        isOpen={Boolean(conflictQueue)}
        fileName={conflictQueue?.pendingConflicts[0]?.name || ""}
        remainingCount={conflictQueue?.pendingConflicts.length || 0}
        onResolve={handleConflictResolve}
        onCancel={() => setConflictQueue(null)}
      />
    </>
  );
}
