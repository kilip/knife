import { useRef } from "react";
import {
  FolderPlus,
  FilePlus,
  RefreshCw,
  Compass,
  ArrowUp,
  Eye,
  EyeOff,
  Upload,
  ChevronRight,
} from "lucide-react";

interface FileBrowserHeaderProps {
  currentPath: string;
  canNavigateParent: boolean;
  showHidden: boolean;
  isSyncing: boolean;
  onNavigate: (path: string) => void;
  onNavigateParent: () => void;
  onRefresh: () => void;
  onSyncCwd: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onUploadFiles: (files: FileList) => void;
  onUploadFolder: (files: FileList) => void;
  onToggleHidden: () => void;
}

export function FileBrowserHeader({
  currentPath,
  canNavigateParent,
  showHidden,
  isSyncing,
  onNavigate,
  onNavigateParent,
  onRefresh,
  onSyncCwd,
  onCreateFolder,
  onCreateFile,
  onUploadFiles,
  onUploadFolder,
  onToggleHidden,
}: FileBrowserHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Parse path segments for breadcrumbs
  const pathParts = currentPath.split("/").filter(Boolean);
  const breadcrumbs = [
    { name: "/", path: "/" },
    ...pathParts.map((part, index) => ({
      name: part,
      path: "/" + pathParts.slice(0, index + 1).join("/"),
    })),
  ];

  return (
    <div className="flex flex-col border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
      {/* Action Toolbar */}
      <div className="flex items-center justify-between px-2 py-1.5 gap-1 border-b border-[var(--border-subtle)]/50 text-[var(--fg-muted)]">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canNavigateParent}
            onClick={onNavigateParent}
            className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-30 disabled:hover:bg-transparent hover:text-[var(--fg-base)] transition-colors"
            title="Go to parent directory (..)"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--fg-base)] transition-colors"
            title="Refresh directory"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onSyncCwd}
            className={`p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--fg-base)] transition-colors ${
              isSyncing ? "text-[var(--accent)] animate-spin" : ""
            }`}
            title="Sync with active tab's CWD"
          >
            <Compass className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCreateFile}
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--fg-base)] transition-colors"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onCreateFolder}
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--fg-base)] transition-colors"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1 rounded hover:bg-[var(--bg-hover)] hover:text-[var(--fg-base)] transition-colors"
            title="Upload Files"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onToggleHidden}
            className={`p-1 rounded hover:bg-[var(--bg-hover)] transition-colors ${
              showHidden ? "text-[var(--accent)]" : "hover:text-[var(--fg-base)]"
            }`}
            title={showHidden ? "Hide hidden files (Ctrl+H)" : "Show hidden files (Ctrl+H)"}
          >
            {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Hidden inputs for uploading */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in browsers
          webkitdirectory=""
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadFolder(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {/* Breadcrumbs Navigation */}
      <div className="flex items-center px-2 py-1 overflow-x-auto text-xs font-mono scrollbar-none whitespace-nowrap">
        {breadcrumbs.map((crumb, idx) => (
          <div key={crumb.path} className="flex items-center shrink-0">
            {idx > 0 && <ChevronRight className="w-3 h-3 text-[var(--fg-muted)] mx-0.5" />}
            <button
              type="button"
              onClick={() => onNavigate(crumb.path)}
              className={`px-1 py-0.5 rounded hover:bg-[var(--bg-hover)] transition-colors ${
                idx === breadcrumbs.length - 1
                  ? "font-semibold text-[var(--fg-base)]"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
              }`}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
