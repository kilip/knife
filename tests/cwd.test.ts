import { describe, it, expect } from "bun:test";
import { getTopLevelDir } from "../app/utils/cwd";

describe("CWD Top-Level Directory Resolution", () => {
  it("resolves top level directory name from POSIX paths", () => {
    expect(getTopLevelDir("/home/toni/code/knife")).toBe("knife");
    expect(getTopLevelDir("/home/toni/code/knife/")).toBe("knife");
    expect(getTopLevelDir("/var/log")).toBe("log");
    expect(getTopLevelDir("/home/toni")).toBe("toni");
  });

  it("handles root directory and empty strings safely", () => {
    expect(getTopLevelDir("/")).toBe("/");
    expect(getTopLevelDir("")).toBe("/");
  });

  it("handles Windows backslashes", () => {
    expect(getTopLevelDir("C:\\Users\\toni\\code\\knife")).toBe("knife");
    expect(getTopLevelDir("D:\\projects\\web\\")).toBe("web");
  });
});
