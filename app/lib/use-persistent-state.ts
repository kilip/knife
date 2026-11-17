import { useCallback, useState } from "react";

export const STORAGE_KEYS = {
  THEME: "knife_theme",
  FONT_SIZE: "knife_font_size",
  SETTINGS: "knife_settings",
  FILE_BROWSER_OPEN: "knife_file_browser_open",
  QUICK_KEYS_OPEN: "knife_quick_keys_open",
  FILE_BROWSER_HIDDEN: "knife_file_browser_hidden",
  FILE_BROWSER_WIDTH: "knife_file_browser_width",
} as const;

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 32;

export function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function clampFontSize(size: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size));
}

export function parseFontSize(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < FONT_SIZE_MIN || parsed > FONT_SIZE_MAX) {
    return undefined;
  }
  return parsed;
}

export function parseBoolean(raw: string): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

export function parsePositiveInt(raw: string): number | undefined {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export interface PersistentStateOptions<T> {
  parse?: (raw: string) => T | undefined;
  serialize?: (val: T) => string;
}

function defaultParse<T>(raw: string, fallback: T): T | undefined {
  if (typeof fallback === "boolean") {
    return parseBoolean(raw) as T | undefined;
  }
  if (typeof fallback === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? (n as T) : undefined;
  }
  if (typeof fallback === "string") {
    return raw as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function defaultSerialize<T>(val: T): string {
  if (typeof val === "string") return val;
  if (typeof val === "boolean" || typeof val === "number") return String(val);
  return JSON.stringify(val);
}

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  options?: PersistentStateOptions<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    const fallback = typeof initial === "function" ? (initial as () => T)() : initial;
    const raw = readStorage(key);
    if (raw === null) {
      return fallback;
    }
    const parsed = options?.parse ? options.parse(raw) : defaultParse(raw, fallback);
    return parsed !== undefined ? parsed : fallback;
  });

  const setPersistentState = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        const serialized = options?.serialize
          ? options.serialize(resolved)
          : defaultSerialize(resolved);
        writeStorage(key, serialized);
        return resolved;
      });
    },
    [key, options?.serialize],
  );

  return [state, setPersistentState];
}
