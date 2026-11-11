import {
  existsSync,
  statSync,
  lstatSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, basename, join, relative } from "node:path";
import { resolveConfigPath } from "./config";
import { resolveDataDir } from "./storage";
import os from "node:os";

export const SYSTEM_PROTECTED_PATHS = [
  "/",
  "/boot",
  "/etc",
  "/sys",
  "/proc",
  "/dev",
  "/bin",
  "/sbin",
  "/usr/bin",
  "/usr/sbin",
];

export function getDefaultHome(): string {
  return process.env.HOME || os.homedir() || "/";
}

export function normalizePath(inputPath?: string | null): string {
  if (!inputPath || !inputPath.trim()) {
    return resolve(getDefaultHome());
  }
  const trimmed = inputPath.trim();
  const home = getDefaultHome();
  if (trimmed === "~") {
    return resolve(home);
  }
  if (trimmed.startsWith("~/")) {
    return resolve(join(home, trimmed.slice(2)));
  }
  return resolve(trimmed);
}

export function isProtectedPath(targetPath: string): boolean {
  const norm = normalizePath(targetPath);

  // Exact root
  if (norm === "/") return true;

  // System protected paths
  for (const p of SYSTEM_PROTECTED_PATHS) {
    if (p === "/") continue;
    if (norm === p || norm.startsWith(`${p}/`)) {
      return true;
    }
  }

  // Knife installation root and data
  const knifeRoot = resolve(process.cwd());
  const cwdData = resolve(join(process.cwd(), "data"));
  const cwdConfig = resolve(join(process.cwd(), "config.json"));
  const resolvedData = resolve(resolveDataDir());
  const resolvedConfig = resolve(resolveConfigPath());

  if (norm === knifeRoot) return true;
  if (norm === cwdData || norm.startsWith(`${cwdData}/`)) return true;
  if (norm === cwdConfig) return true;
  if (norm === resolvedData || norm.startsWith(`${resolvedData}/`)) return true;
  if (norm === resolvedConfig) return true;

  return false;
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

export function listDirectory(
  targetDir: string,
  includeHidden = false,
): { path: string; parent: string | null; items: FsItem[] } {
  const norm = normalizePath(targetDir);
  if (!existsSync(norm)) {
    throw new Error(`Directory not found: ${norm}`);
  }
  const stat = statSync(norm);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${norm}`);
  }

  const entries = readdirSync(norm, { withFileTypes: true });
  const items: FsItem[] = [];

  for (const entry of entries) {
    if (!includeHidden && entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = join(norm, entry.name);
    try {
      const entryStat = statSync(fullPath);
      items.push({
        name: entry.name,
        path: fullPath,
        size: entryStat.isDirectory() ? 0 : entryStat.size,
        mtime: entryStat.mtimeMs,
        isDirectory: entryStat.isDirectory(),
        isSymlink: entry.isSymbolicLink(),
        mode: entryStat.mode,
      });
    } catch {
      // Inaccessible files or broken symlinks
      items.push({
        name: entry.name,
        path: fullPath,
        size: 0,
        mtime: 0,
        isDirectory: false,
        isSymlink: entry.isSymbolicLink(),
        mode: 0,
      });
    }
  }

  // Sort directories first, then alphabetical by name
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const parent = norm === "/" ? null : dirname(norm);
  return { path: norm, parent, items };
}

export function statItem(targetPath: string): FsItem & { isText?: boolean; extension?: string } {
  const norm = normalizePath(targetPath);
  if (!existsSync(norm)) {
    throw new Error(`Item not found: ${norm}`);
  }
  const stat = statSync(norm);
  const lstat = lstatSync(norm);
  const ext = norm.includes(".") ? norm.split(".").pop()?.toLowerCase() || "" : "";
  const textExtensions = new Set([
    "txt",
    "md",
    "markdown",
    "json",
    "js",
    "ts",
    "jsx",
    "tsx",
    "css",
    "html",
    "htm",
    "py",
    "sh",
    "bash",
    "zsh",
    "yml",
    "yaml",
    "toml",
    "conf",
    "ini",
    "env",
    "log",
    "sql",
    "c",
    "cpp",
    "h",
    "hpp",
    "rs",
    "go",
    "php",
    "rb",
    "xml",
    "svg",
    "csv",
  ]);

  return {
    name: basename(norm),
    path: norm,
    size: stat.size,
    mtime: stat.mtimeMs,
    isDirectory: stat.isDirectory(),
    isSymlink: lstat.isSymbolicLink(),
    mode: stat.mode,
    extension: ext,
    isText: textExtensions.has(ext),
  };
}

export async function createZipStream(
  paths: string[],
): Promise<{ stream: ReadableStream; archiveName: string }> {
  if (!paths || paths.length === 0) {
    throw new Error("No paths specified for archive");
  }

  const normalized = paths.map((p) => normalizePath(p));
  for (const p of normalized) {
    if (!existsSync(p)) {
      throw new Error(`Path does not exist: ${p}`);
    }
  }

  let cwd: string;
  let relPaths: string[];
  let archiveName: string;

  if (normalized.length === 1) {
    const single = normalized[0];
    cwd = dirname(single);
    relPaths = [basename(single)];
    archiveName = `${basename(single) || "archive"}.zip`;
  } else {
    // Find common parent directory
    const partsList = normalized.map((p) => p.split("/"));
    let commonParts: string[] = [];
    const first = partsList[0];
    for (let i = 0; i < first.length; i++) {
      const part = first[i];
      if (partsList.every((parts) => parts[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }
    cwd = commonParts.join("/") || "/";
    relPaths = normalized.map((p) => relative(cwd, p));
    archiveName = "archive.zip";
  }

  const proc = Bun.spawn(["zip", "-r", "-q", "-", ...relPaths], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    stream: proc.stdout as ReadableStream,
    archiveName,
  };
}
