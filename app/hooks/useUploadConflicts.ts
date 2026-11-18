import { useState } from "react";
import type { ConflictResolution, FsItem } from "~/components/FileBrowser/types";

type OnUpload = (
  targetDir: string,
  files: File[] | FileList,
  relativePaths?: string[],
  overwrite?: boolean,
) => void;

interface ConflictQueue {
  files: File[];
  targetDir: string;
  pendingConflicts: File[];
}

export function useUploadConflicts(items: FsItem[], currentPath: string, onUpload: OnUpload) {
  const [conflictQueue, setConflictQueue] = useState<ConflictQueue | null>(null);

  // Upload dispatch with collision handling
  const queueUpload = (fileList: File[] | FileList, relativePaths?: string[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const existingNames = new Set(items.map((i) => i.name));
    const conflicts = files.filter((f) => existingNames.has(f.name));

    if (conflicts.length > 0) {
      setConflictQueue({ files, targetDir: currentPath, pendingConflicts: conflicts });
    } else {
      onUpload(currentPath, files, relativePaths, true);
    }
  };

  const resolveConflict = (resolution: ConflictResolution) => {
    if (!conflictQueue) return;
    const { files, targetDir } = conflictQueue;
    onUpload(targetDir, files, undefined, resolution.action === "overwrite");
    setConflictQueue(null);
  };

  return {
    conflictQueue,
    queueUpload,
    resolveConflict,
    cancelConflict: () => setConflictQueue(null),
  };
}
