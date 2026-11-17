import { afterEach, describe, expect, it } from "bun:test";
import { ApiError, api, apiRaw } from "../app/lib/api";

describe("Typed API Client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("performs GET, POST, PATCH, and DELETE with JSON serialization and headers", async () => {
    const calls: Array<{
      url: string;
      method?: string;
      contentType: string | null;
      body?: unknown;
    }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        method: init?.method,
        contentType: headers.get("Content-Type"),
        body: init?.body,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    expect(await api.get<{ ok: boolean }>("/api/tabs")).toEqual({ ok: true });
    expect(await api.post<{ ok: boolean }>("/api/tabs", { name: "New" })).toEqual({ ok: true });
    expect(await api.patch<{ ok: boolean }>("/api/tabs/1", { name: "Renamed" })).toEqual({
      ok: true,
    });
    expect(await api.delete<{ ok: boolean }>("/api/tabs/1")).toEqual({ ok: true });

    expect(calls[0].method).toBe("GET");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].contentType).toBe("application/json");
    expect(calls[1].body).toBe(JSON.stringify({ name: "New" }));
    expect(calls[2].method).toBe("PATCH");
    expect(calls[2].contentType).toBe("application/json");
    expect(calls[3].method).toBe("DELETE");
  });

  it("throws ApiError with status and message on non-2xx responses", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        statusText: "Forbidden",
      })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await api.post("/api/tabs", { name: "Test" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(403);
    expect((caught as ApiError).message).toBe("Forbidden origin");

    globalThis.fetch = (async () =>
      new Response("Internal Error", {
        status: 500,
        statusText: "Internal Server Error",
      })) as unknown as typeof fetch;

    let caughtText: unknown;
    try {
      await api.get("/api/tabs");
    } catch (err) {
      caughtText = err;
    }
    expect(caughtText).toBeInstanceOf(ApiError);
    expect((caughtText as ApiError).status).toBe(500);
    expect((caughtText as ApiError).message).toBe("Internal Server Error");
  });

  it("propagates network failures and supports apiRaw for streaming/no-store requests", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(api.get("/api/health")).rejects.toThrow("ECONNREFUSED");

    let capturedCache: RequestCache | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedCache = init?.cache;
      return new Response("stream-body", { status: 200 });
    }) as unknown as typeof fetch;

    const rawRes = await apiRaw("/api/health", { cache: "no-store" });
    expect(capturedCache).toBe("no-store");
    expect(await rawRes.text()).toBe("stream-body");
  });
});
