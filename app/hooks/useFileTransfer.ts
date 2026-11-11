import { useState, useCallback, useRef } from "react";
import type { FileTransferItem } from "~/components/FileBrowser/types";

export function useFileTransfer() {
  const [transfers, setTransfers] = useState<FileTransferItem[]>([]);
  const abortControllersRef = useRef<Map<string, XMLHttpRequest | AbortController>>(new Map());

  const addTransfer = useCallback((item: FileTransferItem) => {
    setTransfers((prev) => [item, ...prev]);
  }, []);

  const updateTransfer = useCallback((id: string, updates: Partial<FileTransferItem>) => {
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const cancelTransfer = useCallback(
    (id: string) => {
      const handle = abortControllersRef.current.get(id);
      if (handle) {
        if ("abort" in handle) {
          handle.abort();
        }
        abortControllersRef.current.delete(id);
      }
      updateTransfer(id, { status: "cancelled", speed: 0 });
    },
    [updateTransfer],
  );

  const clearCompleted = useCallback(() => {
    setTransfers((prev) =>
      prev.filter((t) => t.status === "pending" || t.status === "transferring"),
    );
  }, []);

  const uploadFiles = useCallback(
    async (
      targetDir: string,
      fileList: File[] | FileList,
      relativePaths?: string[],
      overwrite = true,
      onComplete?: () => void,
    ) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = relativePaths?.[i] || file.name;
        const transferId = crypto.randomUUID();

        const transferItem: FileTransferItem = {
          id: transferId,
          name: relPath,
          type: "upload",
          size: file.size,
          transferred: 0,
          speed: 0,
          status: "transferring",
        };

        addTransfer(transferItem);

        const formData = new FormData();
        formData.append("targetDir", targetDir);
        formData.append("overwrite", overwrite ? "true" : "false");
        formData.append("files", file);
        formData.append("relativePaths", relPath);

        const xhr = new XMLHttpRequest();
        abortControllersRef.current.set(transferId, xhr);

        let lastTime = Date.now();
        let lastLoaded = 0;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;
            if (elapsed >= 0.25) {
              const speed = Math.round((e.loaded - lastLoaded) / elapsed);
              lastTime = now;
              lastLoaded = e.loaded;
              updateTransfer(transferId, {
                transferred: e.loaded,
                speed,
              });
            } else {
              updateTransfer(transferId, {
                transferred: e.loaded,
              });
            }
          }
        };

        xhr.onload = () => {
          abortControllersRef.current.delete(transferId);
          if (xhr.status >= 200 && xhr.status < 300) {
            updateTransfer(transferId, {
              transferred: file.size,
              status: "completed",
              speed: 0,
            });
            onComplete?.();
          } else {
            updateTransfer(transferId, {
              status: "error",
              error: `HTTP ${xhr.status}`,
              speed: 0,
            });
          }
        };

        xhr.onerror = () => {
          abortControllersRef.current.delete(transferId);
          updateTransfer(transferId, {
            status: "error",
            error: "Network error",
            speed: 0,
          });
        };

        xhr.onabort = () => {
          abortControllersRef.current.delete(transferId);
          updateTransfer(transferId, {
            status: "cancelled",
            speed: 0,
          });
        };

        xhr.open("POST", "/api/fs/upload");
        xhr.send(formData);
      }
    },
    [addTransfer, updateTransfer],
  );

  const downloadFile = useCallback(
    (filePath: string, fileName?: string, size = 0) => {
      const name = fileName || filePath.split("/").pop() || "download";
      const transferId = crypto.randomUUID();

      addTransfer({
        id: transferId,
        name,
        type: "download",
        size,
        transferred: size,
        speed: 0,
        status: "completed",
      });

      const url = `/api/fs/download?path=${encodeURIComponent(filePath)}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [addTransfer],
  );

  const downloadArchive = useCallback(
    async (paths: string[], archiveName?: string) => {
      const name = archiveName || "archive.zip";
      const transferId = crypto.randomUUID();

      addTransfer({
        id: transferId,
        name,
        type: "download",
        size: 0,
        transferred: 0,
        speed: 0,
        status: "transferring",
      });

      try {
        const res = await fetch("/api/fs/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paths }),
        });

        if (!res.ok) {
          throw new Error(`Failed to create archive: HTTP ${res.status}`);
        }

        const blob = await res.blob();
        updateTransfer(transferId, {
          size: blob.size,
          transferred: blob.size,
          status: "completed",
          speed: 0,
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err: any) {
        updateTransfer(transferId, {
          status: "error",
          error: err.message || "Archive download failed",
          speed: 0,
        });
      }
    },
    [addTransfer, updateTransfer],
  );

  return {
    transfers,
    uploadFiles,
    downloadFile,
    downloadArchive,
    cancelTransfer,
    clearCompleted,
  };
}
