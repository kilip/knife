import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "~/lib/api";
import { parseFontSize, readStorage, STORAGE_KEYS, writeStorage } from "~/lib/use-persistent-state";
import { applyTheme } from "~/utils/themes";

export interface UserSettings {
  // Appearance
  theme: string;
  compactTabs: boolean;
  // Terminal
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  // Behavior
  copyOnSelect: boolean;
  bellStyle: "none" | "visual" | "sound";
  defaultQuickKeys: boolean;
  confirmCloseTab: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: "catppuccin-mocha",
  compactTabs: false,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: 15,
  lineHeight: 1.2,
  cursorStyle: "block",
  cursorBlink: false,
  scrollback: 5000,
  copyOnSelect: false,
  bellStyle: "none",
  defaultQuickKeys: false,
  confirmCloseTab: false,
};

export const FONT_PRESETS = [
  {
    name: "System Default",
    value: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  {
    name: "JetBrains Mono",
    value: "'JetBrains Mono', ui-monospace, Menlo, Monaco, monospace",
  },
  {
    name: "Fira Code",
    value: "'Fira Code', ui-monospace, Menlo, Monaco, monospace",
  },
  {
    name: "SF Mono / Menlo",
    value: "'SF Mono', Menlo, Monaco, Consolas, monospace",
  },
  {
    name: "Cascadia Code",
    value: "'Cascadia Code', Consolas, monospace",
  },
];

export function getStoredSettings(): UserSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_USER_SETTINGS };
  }
  try {
    const raw = readStorage(STORAGE_KEYS.SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return { ...DEFAULT_USER_SETTINGS, ...parsed };
      }
    }
  } catch {}

  // Backwards compatibility with standalone keys
  const legacyTheme = readStorage(STORAGE_KEYS.THEME);
  const parsedFontSize = parseFontSize(readStorage(STORAGE_KEYS.FONT_SIZE));

  return {
    ...DEFAULT_USER_SETTINGS,
    ...(legacyTheme ? { theme: legacyTheme } : {}),
    ...(parsedFontSize !== undefined ? { fontSize: parsedFontSize } : {}),
  };
}

export function saveSettingsToLocal(settings: UserSettings): void {
  writeStorage(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  writeStorage(STORAGE_KEYS.THEME, settings.theme);
  writeStorage(STORAGE_KEYS.FONT_SIZE, String(settings.fontSize));
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(getStoredSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const activeSettingsRef = useRef(settings);

  useEffect(() => {
    activeSettingsRef.current = settings;
  }, [settings]);

  // Initial revalidation from server
  useEffect(() => {
    let isCancelled = false;
    async function fetchServerSettings() {
      try {
        const data = await api.get<Partial<UserSettings>>("/api/settings");
        if (!isCancelled && typeof data === "object" && data !== null) {
          setSettings((prev) => {
            const merged = { ...prev, ...data };
            saveSettingsToLocal(merged);
            applyTheme(merged.theme);
            return merged;
          });
        }
      } catch {
        // Fall back gracefully to stored settings
      } finally {
        if (!isCancelled) {
          setIsLoaded(true);
        }
      }
    }
    fetchServerSettings();
    return () => {
      isCancelled = true;
    };
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>): Promise<UserSettings> => {
      const next: UserSettings = { ...activeSettingsRef.current, ...patch };
      setSettings(next);
      saveSettingsToLocal(next);

      if (patch.theme) {
        applyTheme(patch.theme);
      }

      setIsSaving(true);
      try {
        const data = await api.patch<UserSettings>("/api/settings", patch);
        setSettings(data);
        saveSettingsToLocal(data);
        return data;
      } catch (err) {
        console.error("Failed to sync settings with server:", err);
      } finally {
        setIsSaving(false);
      }
      return next;
    },
    [],
  );

  const resetSettings = useCallback(async (): Promise<UserSettings> => {
    return updateSettings(DEFAULT_USER_SETTINGS);
  }, [updateSettings]);

  return {
    settings,
    isLoaded,
    isSaving,
    updateSettings,
    resetSettings,
  };
}
