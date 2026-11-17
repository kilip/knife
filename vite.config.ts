import { reactRouter } from "@react-router/dev/vite";
import { serwist } from "@serwist/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export const INDEX_HTML_REVISION_PLACEHOLDER = "__KNIFE_INDEX_HTML_REVISION__";

export default defineConfig({
  build: {
    outDir: "build/client",
  },
  plugins: [
    tailwindcss(),
    reactRouter(),
    serwist({
      swSrc: "app/sw.ts",
      globDirectory: "build/client",
      injectionPoint: "self.__SW_MANIFEST",
      swDest: "sw.js",
      additionalPrecacheEntries: [
        { url: "/index.html", revision: INDEX_HTML_REVISION_PLACEHOLDER },
      ],
    }),
  ],
});
