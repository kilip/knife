import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  clampPopoverPosition,
  isSafeHttpUrl,
  UrlActionPopover,
} from "../app/features/terminal/UrlActionPopover";

describe("isSafeHttpUrl", () => {
  it("accepts valid http and https URLs", () => {
    expect(isSafeHttpUrl("https://example.com/path?a=1&b=2#hash")).toBe(true);
    expect(isSafeHttpUrl("http://localhost:3000/test")).toBe(true);
    expect(isSafeHttpUrl("https://sub.domain.org:8443")).toBe(true);
  });

  it("rejects non-HTTP(S) protocols and malformed URLs", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeHttpUrl("mailto:user@example.com")).toBe(false);
    expect(isSafeHttpUrl("ssh://user@host")).toBe(false);
    expect(isSafeHttpUrl("not a url")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });
});

describe("clampPopoverPosition", () => {
  it("keeps coordinates inside container bounds with 8px padding", () => {
    expect(clampPopoverPosition(100, 120, 800, 600)).toEqual({ left: 100, top: 120 });
    expect(clampPopoverPosition(-20, -10, 800, 600)).toEqual({ left: 8, top: 8 });
    expect(clampPopoverPosition(780, 580, 800, 600, 280, 84)).toEqual({
      left: 512,
      top: 508,
    });
  });

  it("falls back to 8px padding when container is smaller than popover", () => {
    expect(clampPopoverPosition(150, 90, 200, 60, 280, 84)).toEqual({ left: 8, top: 8 });
  });
});

describe("UrlActionPopover", () => {
  it("renders truncated URL preview, safe Open link, and Copy button", () => {
    const url = "https://example.com/some/very/long/path?token=abc";
    const html = renderToString(
      React.createElement(UrlActionPopover, {
        url,
        left: 24,
        top: 48,
        onClose: () => {},
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(`title="${url}"`);
    expect(html).toContain("truncate font-mono text-xs text-[var(--fg-muted)]");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Open");
    expect(html).toContain("Copy");
  });

  it("renders nothing for unsafe URLs", () => {
    const html = renderToString(
      React.createElement(UrlActionPopover, {
        url: "javascript:alert(1)",
        left: 24,
        top: 48,
        onClose: () => {},
      }),
    );

    expect(html).toBe("");
  });
});
