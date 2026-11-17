import { describe, expect, it } from "bun:test";
import type { TabData } from "@shared/tabs";
import {
  getAdjacentTabId,
  getNextActiveTabIdAfterClose,
  moveTabInList,
} from "../app/hooks/useTabs";

const sampleTabs: TabData[] = [
  { id: "a", name: "Tab A", order: 0, createdAt: 100 },
  { id: "b", name: "Tab B", order: 1, createdAt: 200 },
  { id: "c", name: "Tab C", order: 2, createdAt: 300 },
];

describe("useTabs Pure Helpers", () => {
  it("moves tabs left and right and respects boundaries", () => {
    expect(moveTabInList(sampleTabs, "a", "left")).toBeNull();
    expect(moveTabInList(sampleTabs, "c", "right")).toBeNull();
    expect(moveTabInList(sampleTabs, "missing", "left")).toBeNull();

    const movedRight = moveTabInList(sampleTabs, "a", "right");
    expect(movedRight?.map((t) => t.id)).toEqual(["b", "a", "c"]);
    expect(movedRight?.map((t) => t.order)).toEqual([0, 1, 2]);

    const movedLeft = moveTabInList(sampleTabs, "c", "left");
    expect(movedLeft?.map((t) => t.id)).toEqual(["a", "c", "b"]);
    expect(movedLeft?.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it("cycles adjacent tabs with wrap-around", () => {
    expect(getAdjacentTabId(sampleTabs, "a", "prev")).toBe("c");
    expect(getAdjacentTabId(sampleTabs, "c", "next")).toBe("a");
    expect(getAdjacentTabId(sampleTabs, "b", "next")).toBe("c");
    expect(getAdjacentTabId([], "a", "next")).toBeNull();
  });

  it("selects neighbor when closing active tab and keeps active when closing another", () => {
    expect(getNextActiveTabIdAfterClose(sampleTabs, "b", "c")).toBe("b");
    expect(getNextActiveTabIdAfterClose(sampleTabs, "b", "b")).toBe("a");
    expect(getNextActiveTabIdAfterClose(sampleTabs, "c", "c")).toBe("b");
    expect(getNextActiveTabIdAfterClose(sampleTabs, "a", "a")).toBe("b");
    expect(getNextActiveTabIdAfterClose([sampleTabs[0]], "a", "a")).toBe("");
  });
});
