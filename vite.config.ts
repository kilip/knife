import { serwist } from "@serwist/vite";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

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
      additionalPrecacheEntries: [{ url: "/index.html", revision: "1.0.0" }],
    }),
  ],
});
