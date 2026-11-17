import { existsSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import { normalizePath } from "./paths";

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
    const commonParts: string[] = [];
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

  const proc = Bun.spawn(["zip", "-r", "-q", "-", "--", ...relPaths], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    stream: proc.stdout as ReadableStream,
    archiveName,
  };
}
