import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "@react-router/dev/config";
import { INDEX_HTML_REVISION_PLACEHOLDER } from "./vite.config";

export default {
  ssr: false,
  buildEnd({ viteConfig }) {
    const outDir = resolve(viteConfig.root, "build/client");
    const indexHtmlPath = resolve(outDir, "index.html");
    const swPath = resolve(outDir, "sw.js");
    if (!existsSync(indexHtmlPath) || !existsSync(swPath)) {
      return;
    }

    const html = readFileSync(indexHtmlPath);
    const revision = createHash("sha256").update(html).digest("hex").slice(0, 16);
    const swContent = readFileSync(swPath, "utf-8");
    if (swContent.includes(INDEX_HTML_REVISION_PLACEHOLDER)) {
      writeFileSync(
        swPath,
        swContent.replaceAll(INDEX_HTML_REVISION_PLACEHOLDER, revision),
        "utf-8",
      );
    }
  },
} satisfies Config;
