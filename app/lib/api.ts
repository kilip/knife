export class ApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiRaw(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown; message?: unknown };
    if (typeof data?.error === "string" && data.error.length > 0) {
      return data.error;
    }
    if (typeof data?.message === "string" && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // Non-JSON error body; fall back to statusText / status
  }
  return res.statusText || `HTTP ${res.status}`;
}

async function requestJson<T>(
  method: string,
  url: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasJsonBody = body !== undefined;
  if (hasJsonBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...init,
    method,
    headers,
    body: hasJsonBody ? JSON.stringify(body) : init?.body,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await extractErrorMessage(res));
  }

  return (await res.json()) as T;
}

export const api = {
  get<T>(url: string, init?: RequestInit): Promise<T> {
    return requestJson<T>("GET", url, undefined, init);
  },
  post<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
    return requestJson<T>("POST", url, body, init);
  },
  patch<T>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
    return requestJson<T>("PATCH", url, body, init);
  },
  delete<T>(url: string, init?: RequestInit): Promise<T> {
    return requestJson<T>("DELETE", url, undefined, init);
  },
};
