/// <reference lib="webworker" />
import { defaultCache } from "@serwist/vite/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // User decides via UI to avoid dropping active terminals
  clientsClaim: true,
  navigationPreload: true,
  precacheOptions: {
    cleanupOutdatedCaches: true,
    navigateFallback: "/index.html",
    // Never intercept API, WebSocket, or Auth requests with SPA fallback
    navigateFallbackDenylist: [/^\/api\//, /^\/ws\//, /^\/auth\//],
  },
  runtimeCaching: [
    ...defaultCache.filter((route) => {
      // Exclude generic API caching so terminal tabs / session states stay fresh
      return String(route.matcher) !== String(/\/api\/.*$/i);
    }),
  ],
});

// Allow the React UI to trigger immediate activation
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

serwist.addEventListeners();
