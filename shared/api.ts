import type { TabData } from "./tabs";

export interface ApiErrorResponse {
  error: string;
}

export type TabsListResponse = TabData[];
export type TabResponse = TabData;

export interface TabCwdResponse {
  id: string;
  cwd: string;
}

export interface MeResponse {
  authenticated: boolean;
  username?: string;
  theme?: string;
  shell?: string;
  shellName?: string;
}

export interface FsItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
  isDirectory: boolean;
  isSymlink: boolean;
  mode: number;
}

export interface FsListResponse {
  path: string;
  parent: string | null;
  items: FsItem[];
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  cached?: boolean;
  isService: boolean;
  activeTabsCount: number;
  command: string;
}

export type UpdateCheckResponse = UpdateInfo;
