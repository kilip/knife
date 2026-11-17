import { Hono } from "hono";
import { getSessionFromCookie } from "../../auth";
import type { KnifeConfig } from "../../config";
import { getDefaultHome } from "../fs/paths";
import { getShellName } from "../terminal/shell";
import { closeActivePty, getActivePty } from "../terminal/ws";
import { saveTabs, type TabData } from "./store";

export interface TabsRoutesDeps {
  getConfig: () => KnifeConfig;
  getTabs: () => TabData[];
  setTabs: (tabs: TabData[]) => void;
  persistTabs?: (tabs: TabData[]) => void;
}

function requireJsonContentType(req: Request): Response | null {
  const contentType = req.headers.get("content-type");
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  return null;
}

export function createTabsRoutes(deps: TabsRoutesDeps) {
  const router = new Hono();
  const persist = deps.persistTabs ?? saveTabs;

  router.use("*", async (c, next) => {
    const cfg = deps.getConfig();
    const session = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  router.get("/", (c) => {
    return c.json(deps.getTabs());
  });

  router.post("/", async (c) => {
    const contentTypeErr = requireJsonContentType(c.req.raw);
    if (contentTypeErr) return contentTypeErr;

    const body = (await c.req.json().catch(() => ({}))) as {
      name?: string;
      cols?: number;
      rows?: number;
    };
    const currentTabs = deps.getTabs();
    const id = crypto.randomUUID().slice(0, 8);
    const shellName = getShellName();
    const tabName = body.name?.trim() || `${shellName} ${currentTabs.length + 1}`;

    const newTab: TabData = {
      id,
      name: tabName,
      order: currentTabs.length,
      createdAt: Date.now(),
    };

    const nextTabs = [...currentTabs, newTab];
    try {
      persist(nextTabs);
    } catch (err) {
      console.error("[server] Failed to save tabs on create:", err);
      return c.json({ error: "Failed to persist tabs" }, 500);
    }
    deps.setTabs(nextTabs);

    return c.json(newTab, 201);
  });

  router.post("/reorder", async (c) => {
    const contentTypeErr = requireJsonContentType(c.req.raw);
    if (contentTypeErr) return contentTypeErr;

    const body = (await c.req.json().catch(() => ({}))) as { tabIds?: string[] };
    if (Array.isArray(body.tabIds)) {
      const currentTabs = deps.getTabs();
      const idMap = new Map(currentTabs.map((t) => [t.id, t]));
      const reordered: TabData[] = [];
      body.tabIds.forEach((id, index) => {
        const tab = idMap.get(id);
        if (tab) {
          reordered.push({ ...tab, order: index });
          idMap.delete(id);
        }
      });
      idMap.forEach((tab) => {
        reordered.push({ ...tab, order: reordered.length });
      });
      try {
        persist(reordered);
      } catch (err) {
        console.error("[server] Failed to save tabs on reorder:", err);
        return c.json({ error: "Failed to persist tab order" }, 500);
      }
      deps.setTabs(reordered);
    }

    return c.json(deps.getTabs());
  });

  router.get("/:id/cwd", (c) => {
    const targetTabId = c.req.param("id");
    const tab = deps.getTabs().find((t) => t.id === targetTabId);
    if (!tab) {
      return c.json({ error: "Tab not found" }, 404);
    }
    const activePty = getActivePty(tab.id);
    const cwd = activePty?.getCwd() || getDefaultHome();
    return c.json({ id: tab.id, cwd });
  });

  router.patch("/:id", async (c) => {
    const tabId = c.req.param("id");
    const currentTabs = deps.getTabs();
    const tabIndex = currentTabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) {
      return c.json({ error: "Tab not found" }, 404);
    }

    const contentTypeErr = requireJsonContentType(c.req.raw);
    if (contentTypeErr) return contentTypeErr;

    const body = (await c.req.json().catch(() => ({}))) as { name?: string };
    if (body.name && typeof body.name === "string") {
      const trimmedName = body.name.trim();
      const nextTabs = currentTabs.map((t, i) =>
        i === tabIndex ? { ...t, name: trimmedName } : t,
      );
      try {
        persist(nextTabs);
      } catch (err) {
        console.error("[server] Failed to save tabs on rename:", err);
        return c.json({ error: "Failed to persist tab rename" }, 500);
      }
      deps.setTabs(nextTabs);
    }

    return c.json(deps.getTabs()[tabIndex]);
  });

  router.delete("/:id", (c) => {
    const tabId = c.req.param("id");
    const currentTabs = deps.getTabs();
    const tabIndex = currentTabs.findIndex((t) => t.id === tabId);
    if (tabIndex === -1) {
      return c.json({ error: "Tab not found" }, 404);
    }

    const deletedTab = currentTabs[tabIndex];
    const nextTabs = currentTabs
      .filter((_, i) => i !== tabIndex)
      .map((t, i) => ({ ...t, order: i }));
    try {
      persist(nextTabs);
    } catch (err) {
      console.error("[server] Failed to save tabs on delete:", err);
      return c.json({ error: "Failed to persist tab deletion" }, 500);
    }
    closeActivePty(deletedTab.id);
    deps.setTabs(nextTabs);

    return c.json({ success: true, remainingTabs: deps.getTabs() });
  });

  return router;
}
