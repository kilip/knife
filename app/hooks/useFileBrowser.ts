import type { FsListResponse, TabCwdResponse } from "@shared/api";
import { useCallback, useEffect, useState } from "react";
import type { FsItem, SortDirection, SortField } from "~/components/FileBrowser/types";
import { api } from "~/lib/api";
import { STORAGE_KEYS, usePersistentState } from "~/lib/use-persistent-state";

export { getBreadcrumbs, sortItems } from "~/components/FileBrowser/helpers";

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

interface UseFileBrowserOptions {
  isOpen: boolean;
  activeTabId: string;
}

export function useFileBrowser({ isOpen, activeTabId }: UseFileBrowserOptions) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<FsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncingCwd, setIsSyncingCwd] = useState(false);

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [showHidden, setShowHidden] = usePersistentState<boolean>(
    STORAGE_KEYS.FILE_BROWSER_HIDDEN,
    false,
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  const loadDirectory = useCallback(
    async (path?: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/fs/list?path=${encodeURIComponent(path || currentPath || "")}&hidden=${showHidden}`;
        const data = await api.get<FsListResponse>(url);
        setCurrentPath(data.path);
        setParentPath(data.parent);
        setItems(data.items);
      } catch (err: unknown) {
        setError(errorMessage(err, "Failed to load directory"));
      } finally {
        setLoading(false);
      }
    },
    [currentPath, showHidden],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when panel opens or hidden-files toggle changes
  useEffect(() => {
    if (isOpen) {
      loadDirectory();
    }
  }, [isOpen, showHidden]);

  const syncWithTabCwd = useCallback(async () => {
    if (!activeTabId) return;
    setIsSyncingCwd(true);
    try {
      const data = await api.get<TabCwdResponse>(`/api/tabs/${activeTabId}/cwd`);
      if (data.cwd) {
        loadDirectory(data.cwd);
      }
    } catch {
      // Ignored
    } finally {
      setIsSyncingCwd(false);
    }
  }, [activeTabId, loadDirectory]);

  // Keyboard shortcut Ctrl/Cmd+H toggles hidden files
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setShowHidden((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setShowHidden]);

  const navigate = (path: string) => {
    setSelectedPath(null);
    setRenamingPath(null);
    loadDirectory(path);
  };

  const navigateParent = () => {
    if (parentPath) navigate(parentPath);
  };

  const changeSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const createEntry = async (action: "touch" | "mkdir", label: string) => {
    const name = window.prompt(`Enter new ${label} name:`);
    if (!name || !name.trim()) return;
    try {
      await api.post("/api/fs/action", { action, parent: currentPath, name: name.trim() });
      loadDirectory(currentPath);
    } catch (err: unknown) {
      alert(errorMessage(err, `Failed to create ${label}`));
    }
  };

  const createFile = () => createEntry("touch", "file");
  const createFolder = () => createEntry("mkdir", "folder");

  const submitRename = async (newName: string) => {
    if (!renamingPath) return;
    try {
      await api.post("/api/fs/action", { action: "rename", path: renamingPath, name: newName });
      loadDirectory(currentPath);
    } catch (err: unknown) {
      alert(errorMessage(err, "Failed to rename"));
    } finally {
      setRenamingPath(null);
    }
  };

  const deleteItem = async (item: FsItem) => {
    try {
      await api.post("/api/fs/action", { action: "delete", paths: [item.path] });
      loadDirectory(currentPath);
    } catch (err: unknown) {
      alert(errorMessage(err, "Failed to delete"));
    }
  };

  return {
    currentPath,
    parentPath,
    items,
    loading,
    error,
    isSyncingCwd,
    sortField,
    sortDirection,
    showHidden,
    setShowHidden,
    selectedPath,
    setSelectedPath,
    renamingPath,
    setRenamingPath,
    loadDirectory,
    syncWithTabCwd,
    navigate,
    navigateParent,
    changeSort,
    createFile,
    createFolder,
    submitRename,
    deleteItem,
  };
}
