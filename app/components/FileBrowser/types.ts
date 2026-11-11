export interface FsItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  isDirectory: boolean;
  isSymlink: boolean;
  mode: number;
}

export type SortField = "name" | "size" | "mtime";
export type SortDirection = "asc" | "desc";

export interface FileTransferItem {
  id: string;
  name: string;
  type: "upload" | "download";
  size: number;
  transferred: number;
  speed: number; // bytes/sec
  status: "pending" | "transferring" | "completed" | "error" | "cancelled";
  error?: string;
}

export interface ConflictResolution {
  action: "overwrite" | "skip";
  applyToAll: boolean;
}
