import { describe, expect, it } from "bun:test";
import { getBreadcrumbs, sortItems } from "../app/features/file-browser/helpers";
import type { FsItem } from "../app/features/file-browser/types";

const item = (name: string, isDirectory: boolean, size = 0, mtime = 0): FsItem =>
  ({ name, path: `/x/${name}`, isDirectory, size, mtime }) as FsItem;

const names = (items: FsItem[]) => items.map((i) => i.name);

describe("sortItems", () => {
  const items = [
    item("b.txt", false, 5, 20),
    item("Zdir", true, 0, 10),
    item("a.txt", false, 50, 30),
    item("adir", true, 0, 40),
  ];

  it("places directories first and sorts names case-insensitively", () => {
    expect(names(sortItems(items, "name", "asc"))).toEqual(["adir", "Zdir", "a.txt", "b.txt"]);
  });

  it("reverses within groups for desc but keeps directories first", () => {
    expect(names(sortItems(items, "name", "desc"))).toEqual(["Zdir", "adir", "b.txt", "a.txt"]);
  });

  it("sorts by size and mtime", () => {
    expect(names(sortItems(items, "size", "asc")).slice(2)).toEqual(["b.txt", "a.txt"]);
    expect(names(sortItems(items, "mtime", "desc")).slice(0, 2)).toEqual(["adir", "Zdir"]);
  });

  it("is stable for equal keys and does not mutate input", () => {
    const same = [item("a", false, 1), item("A", false, 1), item("a", false, 1)];
    const before = same.slice();
    expect(sortItems(same, "size", "asc")).toEqual(before);
    expect(same).toEqual(before);
  });
});

describe("getBreadcrumbs", () => {
  it("returns only root for '/' and empty path", () => {
    expect(getBreadcrumbs("/")).toEqual([{ name: "/", path: "/" }]);
    expect(getBreadcrumbs("")).toEqual([{ name: "/", path: "/" }]);
  });

  it("builds nested segments", () => {
    expect(getBreadcrumbs("/foo/bar")).toEqual([
      { name: "/", path: "/" },
      { name: "foo", path: "/foo" },
      { name: "bar", path: "/foo/bar" },
    ]);
  });

  it("ignores trailing slashes", () => {
    expect(getBreadcrumbs("/foo/bar/")).toEqual(getBreadcrumbs("/foo/bar"));
  });
});
