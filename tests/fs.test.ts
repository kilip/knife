import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import {
  createZipStream,
  getDefaultHome,
  isProtectedPath,
  listDirectory,
  normalizePath,
  resolveDownloadHeaders,
  statItem,
} from "../server/fs";

const TEST_DIR = join(os.tmpdir(), "knife-fs-test-" + Math.random().toString(36).slice(2));

describe("Filesystem API & Security Guardrails", () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(join(TEST_DIR, "folderA"), { recursive: true });
    mkdirSync(join(TEST_DIR, ".hiddenFolder"), { recursive: true });
    writeFileSync(join(TEST_DIR, "file1.txt"), "Hello Knife");
    writeFileSync(join(TEST_DIR, ".hiddenFile"), "secret");
    writeFileSync(join(TEST_DIR, "folderA", "subfile.md"), "# Subfile");
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("normalizePath handles ~, ~/, and absolute paths", () => {
    const home = getDefaultHome();
    expect(normalizePath("~")).toBe(home);
    expect(normalizePath("~/test")).toBe(join(home, "test"));
    expect(normalizePath("/var/log")).toBe("/var/log");
    expect(normalizePath(null)).toBe(home);
    expect(normalizePath("")).toBe(home);
  });

  it("isProtectedPath protects system critical paths and knife installation", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/boot")).toBe(true);
    expect(isProtectedPath("/etc")).toBe(true);
    expect(isProtectedPath("/etc/shadow")).toBe(true);
    expect(isProtectedPath("/sys/kernel")).toBe(true);
    expect(isProtectedPath("/proc/cpuinfo")).toBe(true);
    expect(isProtectedPath("/dev/null")).toBe(true);
    expect(isProtectedPath("/bin/sh")).toBe(true);
    expect(isProtectedPath("/usr/bin/env")).toBe(true);
    expect(isProtectedPath(process.cwd())).toBe(true);
    expect(isProtectedPath(join(process.cwd(), "data"))).toBe(true);
    expect(isProtectedPath(join(process.cwd(), "data", "tabs.json"))).toBe(true);
    expect(isProtectedPath(join(process.cwd(), "config.json"))).toBe(true);

    // Unprotected user directories
    expect(isProtectedPath(TEST_DIR)).toBe(false);
    expect(isProtectedPath(join(TEST_DIR, "file1.txt"))).toBe(false);
  });

  it("listDirectory lists files and folders, sorting folders first", () => {
    const res = listDirectory(TEST_DIR, false);
    expect(res.path).toBe(TEST_DIR);
    expect(res.items.length).toBe(2); // folderA, file1.txt (.hidden excluded)

    const folder = res.items[0];
    expect(folder.name).toBe("folderA");
    expect(folder.isDirectory).toBe(true);

    const file = res.items[1];
    expect(file.name).toBe("file1.txt");
    expect(file.isDirectory).toBe(false);
    expect(file.size).toBe(11);
  });

  it("listDirectory includes hidden files when hidden=true", () => {
    const res = listDirectory(TEST_DIR, true);
    const names = res.items.map((i) => i.name);
    expect(names).toContain(".hiddenFolder");
    expect(names).toContain(".hiddenFile");
    expect(names).toContain("folderA");
    expect(names).toContain("file1.txt");
  });

  it("statItem provides detailed metadata and detects text files", () => {
    const txtStat = statItem(join(TEST_DIR, "file1.txt"));
    expect(txtStat.name).toBe("file1.txt");
    expect(txtStat.isDirectory).toBe(false);
    expect(txtStat.size).toBe(11);
    expect(txtStat.isText).toBe(true);
    expect(txtStat.extension).toBe("txt");

    const dirStat = statItem(join(TEST_DIR, "folderA"));
    expect(dirStat.isDirectory).toBe(true);
  });

  it("createZipStream streams valid zip archive for files/folders", async () => {
    const { stream, archiveName } = await createZipStream([join(TEST_DIR, "folderA")]);
    expect(archiveName).toBe("folderA.zip");
    expect(stream).toBeDefined();

    const response = new Response(stream);
    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    // Check zip header signature: PK (0x50, 0x4B)
    const view = new Uint8Array(buffer);
    expect(view[0]).toBe(0x50);
    expect(view[1]).toBe(0x4b);
  });

  it("createZipStream safely archives filenames starting with a dash without option injection", async () => {
    const dashFile = join(TEST_DIR, "-test.txt");
    writeFileSync(dashFile, "dash-safe-content");

    const { stream, archiveName } = await createZipStream([dashFile]);
    expect(archiveName).toBe("-test.txt.zip");
    expect(stream).toBeDefined();

    const buffer = await new Response(stream).arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    const view = new Uint8Array(buffer);
    expect(view[0]).toBe(0x50);
    expect(view[1]).toBe(0x4b);
    expect(new TextDecoder().decode(view)).toContain("-test.txt");
  });

  it("resolveDownloadHeaders forces attachment/text-plain for HTML and SVG even with inline=1", () => {
    const htmlHeaders = resolveDownloadHeaders("xss.html", "text/html", true);
    expect(htmlHeaders.contentDisposition).toBe('attachment; filename="xss.html"');
    expect(htmlHeaders.contentType).toBe("text/plain; charset=utf-8");
    expect(htmlHeaders.csp).toBeUndefined();

    const svgHeaders = resolveDownloadHeaders("xss.svg", "image/svg+xml", true);
    expect(svgHeaders.contentDisposition).toBe('attachment; filename="xss.svg"');
    expect(svgHeaders.contentType).toBe("text/plain; charset=utf-8");
    expect(svgHeaders.csp).toBeUndefined();

    const pngInlineHeaders = resolveDownloadHeaders("photo.png", "image/png", true);
    expect(pngInlineHeaders.contentDisposition).toBe("inline");
    expect(pngInlineHeaders.contentType).toBe("image/png");
    expect(pngInlineHeaders.csp).toBe("sandbox");

    const pngDownloadHeaders = resolveDownloadHeaders("photo.png", "image/png", false);
    expect(pngDownloadHeaders.contentDisposition).toBe('attachment; filename="photo.png"');
    expect(pngDownloadHeaders.csp).toBeUndefined();
  });
});
