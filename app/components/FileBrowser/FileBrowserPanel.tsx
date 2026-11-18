import { AlertCircle, Folder, X } from "lucide-react";
import { useState } from "react";
import { useFileBrowser } from "~/hooks/useFileBrowser";
import { usePanelResize } from "~/hooks/usePanelResize";
import { useUploadConflicts } from "~/hooks/useUploadConflicts";
import { ConflictDialog } from "./ConflictDialog";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { FileBrowserHeader } from "./FileBrowserHeader";
import { FileContextMenu } from "./FileContextMenu";
import { shellEscape } from "./FileItemRow";
import { FileList } from "./FileList";
import { FilePreviewModal } from "./FilePreviewModal";
import type { FsItem } from "./types";

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
  const fb = useFileBrowser({ isOpen, activeTabId });
  const { panelWidth, handleMouseDownResize } = usePanelResize();
  const { conflictQueue, queueUpload, resolveConflict, cancelConflict } = useUploadConflicts(
    fb.items,
    fb.currentPath,
    onUpload,
  );

  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    item: FsItem | null;
  }>({ isOpen: false, position: { x: 0, y: 0 }, item: null });
  const [previewItem, setPreviewItem] = useState<FsItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<FsItem | null>(null);

  const handleOpenItem = (item: FsItem) => {
    if (item.isDirectory) {
      fb.navigate(item.path);
    } else {
      setPreviewItem(item);
    }
  };

  const handleContextMenuTrigger = (e: React.MouseEvent, item: FsItem) => {
    e.preventDefault();
    fb.setSelectedPath(item.path);
    setContextMenu({ isOpen: true, position: { x: e.clientX, y: e.clientY }, item });
  };

  const handleDownload = (item: FsItem) => {
    if (item.isDirectory) {
      onDownloadArchive([item.path], `${item.name}.zip`);
    } else {
      onDownloadFile(item.path, item.name, item.size);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    const item = itemToDelete;
    await fb.deleteItem(item);
    setItemToDelete(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop overlay dismissed by click on mobile */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden"
        onClick={onClose}
      />

      {/* Main Container: Split pane on desktop, slide-over drawer on mobile */}
      <aside
        style={{ width: `${panelWidth}px` }}
        className="fixed inset-y-0 left-0 z-40 md:static flex flex-col h-full bg-[var(--bg-elevated)] border-r border-[var(--border-subtle)] shadow-xl md:shadow-none select-none transition-[width] duration-75"
      >
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

        <FileBrowserHeader
          currentPath={fb.currentPath}
          canNavigateParent={Boolean(fb.parentPath)}
          showHidden={fb.showHidden}
          isSyncing={fb.isSyncingCwd}
          onNavigate={fb.navigate}
          onNavigateParent={fb.navigateParent}
          onRefresh={() => fb.loadDirectory(fb.currentPath)}
          onSyncCwd={fb.syncWithTabCwd}
          onCreateFolder={fb.createFolder}
          onCreateFile={fb.createFile}
          onUploadFiles={(files) => queueUpload(files)}
          onUploadFolder={(files) => {
            const relPaths = Array.from(files).map((f) => f.webkitRelativePath || f.name);
            queueUpload(files, relPaths);
          }}
          onToggleHidden={() => fb.setShowHidden((prev) => !prev)}
        />

        {fb.error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-xs text-[var(--fg-muted)] gap-2">
            <AlertCircle className="w-8 h-8 text-[var(--error)]" />
            <span className="font-medium text-[var(--fg-base)]">Error accessing directory</span>
            <span>{fb.error}</span>
            <button
              type="button"
              onClick={() => fb.loadDirectory(fb.parentPath || "/")}
              className="mt-2 px-3 py-1 rounded bg-[var(--accent)] text-white text-xs font-medium"
            >
              Go to Parent
            </button>
          </div>
        ) : (
          <FileList
            items={fb.items}
            parent={fb.parentPath}
            selectedPath={fb.selectedPath}
            renamingPath={fb.renamingPath}
            sortField={fb.sortField}
            sortDirection={fb.sortDirection}
            onSortChange={fb.changeSort}
            onSelect={(item) => fb.setSelectedPath(item.path)}
            onOpen={handleOpenItem}
            onNavigateParent={fb.navigateParent}
            onContextMenu={handleContextMenuTrigger}
            onSubmitRename={fb.submitRename}
            onCancelRename={() => fb.setRenamingPath(null)}
          />
        )}

        <div className="px-3 py-1.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--fg-muted)] bg-[var(--bg-base)] flex justify-between">
          <span>
            {fb.loading
              ? "Loading..."
              : `${fb.items.length} item${fb.items.length === 1 ? "" : "s"}`}
          </span>
          <span>{fb.showHidden ? "Hidden shown" : "Hidden hidden"}</span>
        </div>

        {/* Desktop Split-Pane Resize Handle */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-drag resize handle */}
        <div
          onMouseDown={handleMouseDownResize}
          className="hidden md:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[var(--accent)]/50 transition-colors z-50"
        />
      </aside>

      <FileContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        item={contextMenu.item}
        onClose={() => setContextMenu((prev) => ({ ...prev, isOpen: false }))}
        onDownload={handleDownload}
        onInsertPath={(item) => onInsertTerminalPath(shellEscape(item.path))}
        onCopyPath={(item) => navigator.clipboard.writeText(item.path)}
        onRename={(item) => fb.setRenamingPath(item.path)}
        onDelete={setItemToDelete}
      />

      <FilePreviewModal
        isOpen={Boolean(previewItem)}
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onDownload={(item) => onDownloadFile(item.path, item.name, item.size)}
      />
      <DeleteConfirmModal
        item={itemToDelete}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
      <ConflictDialog
        isOpen={Boolean(conflictQueue)}
        fileName={conflictQueue?.pendingConflicts[0]?.name || ""}
        remainingCount={conflictQueue?.pendingConflicts.length || 0}
        onResolve={resolveConflict}
        onCancel={cancelConflict}
      />
    </>
  );
}
