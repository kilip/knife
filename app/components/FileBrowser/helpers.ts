import type { FsItem, SortDirection, SortField } from "./types";

export interface Breadcrumb {
  name: string;
  path: string;
}

/** Sort items: directories first, then by field/direction. Does not mutate input. */
export function sortItems(
  items: FsItem[],
  sortField: SortField,
  sortDirection: SortDirection,
): FsItem[] {
  return [...items].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;

    let res = 0;
    if (sortField === "name") {
      res = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    } else if (sortField === "size") {
      res = a.size - b.size;
    } else if (sortField === "mtime") {
      res = a.mtime - b.mtime;
    }
    return sortDirection === "asc" ? res : -res;
  });
}

/** Build breadcrumb segments for a path, always starting with the root "/". */
export function getBreadcrumbs(currentPath: string): Breadcrumb[] {
  const parts = currentPath.split("/").filter(Boolean);
  return [
    { name: "/", path: "/" },
    ...parts.map((part, index) => ({
      name: part,
      path: `/${parts.slice(0, index + 1).join("/")}`,
    })),
  ];
}
