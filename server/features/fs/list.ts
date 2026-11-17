import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { normalizePath } from "./paths";

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

const SAFE_INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export interface DownloadHeaders {
  contentType: string;
  contentDisposition: string;
  csp?: string;
}

/**
 * Computes safe Content-Type, Content-Disposition, and optional sandbox CSP
 * for /api/fs/download responses, preventing stored XSS via inline HTML/SVG.
 */
export function resolveDownloadHeaders(
  fileName: string,
  rawMimeType: string,
  inline: boolean,
): DownloadHeaders {
  const baseMime = (rawMimeType || "application/octet-stream").split(";")[0]?.trim().toLowerCase();
  const isSafeInlineImage =
    inline &&
    baseMime.startsWith("image/") &&
    baseMime !== "image/svg+xml" &&
    SAFE_INLINE_IMAGE_TYPES.has(baseMime);

  if (isSafeInlineImage) {
    return {
      contentType: baseMime,
      contentDisposition: "inline",
      csp: "sandbox",
    };
  }

  const safeFileName = fileName.replace(/["\r\n\\]/g, "_");
  const isExecutableMarkup =
    baseMime === "image/svg+xml" ||
    baseMime === "text/html" ||
    baseMime === "application/xhtml+xml";

  return {
    contentType: isExecutableMarkup
      ? "text/plain; charset=utf-8"
      : rawMimeType || "application/octet-stream",
    contentDisposition: `attachment; filename="${safeFileName}"`,
  };
}
