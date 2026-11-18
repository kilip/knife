import { useCallback, useState } from "react";
import { parseBoolean, readStorage, writeStorage } from "./storage";

export {
  clampFontSize,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  parseBoolean,
  parseFontSize,
  parsePositiveInt,
  readStorage,
  STORAGE_KEYS,
  writeStorage,
} from "./storage";

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
