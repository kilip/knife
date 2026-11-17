import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Hono } from "hono";
import { getSessionFromCookie } from "../../auth";
import type { KnifeConfig } from "../../config";
import { listDirectory, resolveDownloadHeaders, statItem } from "./list";
import { getDefaultHome, isProtectedPath, normalizePath } from "./paths";
import { createZipStream } from "./zip";

export interface FsRoutesDeps {
  getConfig: () => KnifeConfig;
}

function requireJsonContentType(req: Request): Response | null {
  const contentType = req.headers.get("content-type");
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }
  return null;
}

export function createFsRoutes(deps: FsRoutesDeps) {
  const router = new Hono();

  router.use("*", async (c, next) => {
    const cfg = deps.getConfig();
    const session = getSessionFromCookie(c.req.header("cookie") ?? null, cfg.sessionSecret);
    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  });

  router.get("/list", (c) => {
    const reqPath = c.req.query("path");
    const hidden = c.req.query("hidden") === "true";
    const norm = normalizePath(reqPath || getDefaultHome());
    if (isProtectedPath(norm)) {
      return c.json({ error: "Access to protected path is forbidden" }, 403);
    }
    try {
      const result = listDirectory(norm, hidden);
      return c.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to list directory";
      return c.json({ error: message }, 400);
    }
  });

  router.get("/stat", (c) => {
    const reqPath = c.req.query("path");
    if (!reqPath) {
      return c.json({ error: "Missing path query parameter" }, 400);
    }
    const norm = normalizePath(reqPath);
    if (isProtectedPath(norm)) {
      return c.json({ error: "Access to protected path is forbidden" }, 403);
    }
    try {
      const result = statItem(norm);
      return c.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to stat item";
      return c.json({ error: message }, 404);
    }
  });

  router.get("/download", (c) => {
    const reqPath = c.req.query("path");
    if (!reqPath) {
      return c.json({ error: "Missing path query parameter" }, 400);
    }
    const norm = normalizePath(reqPath);
    if (isProtectedPath(norm)) {
      return c.json({ error: "Access to protected path is forbidden" }, 403);
    }
    if (!existsSync(norm)) {
      return c.json({ error: "File not found" }, 404);
    }
    const stat = statSync(norm);
    if (stat.isDirectory()) {
      return c.json({ error: "Cannot download directory directly; use archive" }, 400);
    }
    const inline = c.req.query("inline") === "true" || c.req.query("inline") === "1";
    const file = Bun.file(norm);
    const downloadHeaders = resolveDownloadHeaders(
      basename(norm),
      file.type || "application/octet-stream",
      inline,
    );
    const headers = new Headers();
    headers.set("Content-Type", downloadHeaders.contentType);
    headers.set("Content-Disposition", downloadHeaders.contentDisposition);
    if (downloadHeaders.csp) {
      headers.set("Content-Security-Policy", downloadHeaders.csp);
    }
    return new Response(file, { headers });
  });

  router.post("/archive", async (c) => {
    const contentTypeErr = requireJsonContentType(c.req.raw);
    if (contentTypeErr) return contentTypeErr;

    try {
      const body = (await c.req.json().catch(() => ({}))) as { paths?: string[] };
      if (!body.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
        return c.json({ error: "paths array is required" }, 400);
      }
      for (const rawPath of body.paths) {
        if (typeof rawPath !== "string" || isProtectedPath(normalizePath(rawPath))) {
          return c.json({ error: "Access to protected path is forbidden" }, 403);
        }
      }
      const { stream, archiveName } = await createZipStream(body.paths);
      const headers = new Headers();
      headers.set("Content-Type", "application/zip");
      headers.set("Content-Disposition", `attachment; filename="${archiveName}"`);
      return new Response(stream, { headers });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create archive";
      return c.json({ error: message }, 500);
    }
  });

  router.post("/upload", async (c) => {
    try {
      const formData = await c.req.formData();
      const rawTargetDir = (formData.get("targetDir") as string) || "";
      const targetDir = normalizePath(rawTargetDir);
      const overwrite = formData.get("overwrite") === "true";

      if (isProtectedPath(targetDir)) {
        return c.json({ error: "Target directory is protected" }, 403);
      }

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      const files = formData.getAll("files") as File[];
      const relPaths = formData.getAll("relativePaths") as string[];

      const uploaded: string[] = [];
      const skipped: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relPath = relPaths[i] || file.name;
        if (!relPath || typeof relPath !== "string") continue;
        const safeRel = relPath.replace(/^[/\\]+/, "");
        const destPath = resolve(targetDir, safeRel);
        const relFromTarget = relative(targetDir, destPath);

        if (relFromTarget.startsWith("..") || isAbsolute(relFromTarget) || relFromTarget === "") {
          continue;
        }
        if (isProtectedPath(destPath)) {
          skipped.push(relPath);
          continue;
        }

        if (existsSync(destPath) && !overwrite) {
          skipped.push(relPath);
          continue;
        }

        mkdirSync(dirname(destPath), { recursive: true });
        await Bun.write(destPath, file);
        uploaded.push(relPath);
      }

      return c.json({ success: true, uploaded, skipped });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to upload files";
      return c.json({ error: message }, 500);
    }
  });

  router.post("/action", async (c) => {
    const contentTypeErr = requireJsonContentType(c.req.raw);
    if (contentTypeErr) return contentTypeErr;

    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        action?: string;
        path?: string;
        paths?: string[];
        oldPath?: string;
        newPath?: string;
        name?: string;
        parent?: string;
      };

      if (!body.action) {
        return c.json({ error: "Missing action" }, 400);
      }

      if (body.action === "mkdir") {
        const rawTarget =
          body.path || (body.parent && body.name ? join(body.parent, body.name) : "");
        if (!rawTarget || typeof rawTarget !== "string" || !rawTarget.trim()) {
          return c.json({ error: "Missing or invalid path for directory creation" }, 400);
        }
        const target = normalizePath(rawTarget);
        if (isProtectedPath(target)) {
          return c.json({ error: "Cannot create directory in protected location" }, 403);
        }
        mkdirSync(target, { recursive: true });
        return c.json({ success: true, path: target });
      }

      if (body.action === "touch" || body.action === "createFile") {
        const rawTarget =
          body.path || (body.parent && body.name ? join(body.parent, body.name) : "");
        if (!rawTarget || typeof rawTarget !== "string" || !rawTarget.trim()) {
          return c.json({ error: "Missing or invalid path for file creation" }, 400);
        }
        const target = normalizePath(rawTarget);
        if (isProtectedPath(target)) {
          return c.json({ error: "Cannot create file in protected location" }, 403);
        }
        if (!existsSync(target)) {
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, "");
        }
        return c.json({ success: true, path: target });
      }

      if (body.action === "rename") {
        const rawOld = body.oldPath || body.path;
        const rawNew =
          body.newPath ||
          (body.name && rawOld ? join(dirname(normalizePath(rawOld)), body.name) : undefined);
        if (
          !rawOld ||
          typeof rawOld !== "string" ||
          !rawOld.trim() ||
          !rawNew ||
          typeof rawNew !== "string" ||
          !rawNew.trim()
        ) {
          return c.json({ error: "Both source and destination paths must be provided" }, 400);
        }
        const oldP = normalizePath(rawOld);
        const newP = normalizePath(rawNew);
        if (isProtectedPath(oldP) || isProtectedPath(newP)) {
          return c.json({ error: "Cannot rename protected path" }, 403);
        }
        if (!existsSync(oldP)) {
          return c.json({ error: "Source path not found" }, 404);
        }
        renameSync(oldP, newP);
        return c.json({ success: true, oldPath: oldP, newPath: newP });
      }

      if (body.action === "delete") {
        const rawList = (body.paths || (body.path ? [body.path] : [])).filter(
          (p): p is string => typeof p === "string" && p.trim().length > 0,
        );
        if (rawList.length === 0) {
          return c.json({ error: "No valid paths specified for deletion" }, 400);
        }
        const toDelete = rawList.map((p) => normalizePath(p));
        for (const p of toDelete) {
          if (isProtectedPath(p)) {
            return c.json({ error: `Cannot delete protected path: ${p}` }, 403);
          }
        }
        for (const p of toDelete) {
          if (existsSync(p)) {
            rmSync(p, { recursive: true, force: true });
          }
        }
        return c.json({ success: true, deleted: toDelete });
      }

      return c.json({ error: `Unknown action: ${body.action}` }, 400);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Action failed";
      return c.json({ error: message }, 500);
    }
  });

  return router;
}
