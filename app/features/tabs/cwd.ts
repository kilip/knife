/**
 * Extracts top-level folder name from a working directory path.
 * ponytail: basename extraction only; upgrade to full path parser if Windows backslashes needed
 */
export function getTopLevelDir(dirPath: string): string {
  if (!dirPath || dirPath === "/") return "/";
  const normalized = dirPath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.pop() || "/";
}
