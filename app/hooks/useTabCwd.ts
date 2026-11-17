import type { TabCwdResponse } from "@shared/api";
import { useCallback, useEffect } from "react";
import { api } from "~/lib/api";
import { getTopLevelDir } from "~/utils/cwd";

interface UseTabCwdOptions {
  activeTabId: string;
  onCwdFolder: (tabId: string, folderName: string) => void;
}

export function useTabCwd({ activeTabId, onCwdFolder }: UseTabCwdOptions) {
  useEffect(() => {
    if (!activeTabId) return;

    const syncCwd = async () => {
      try {
        const data = await api.get<TabCwdResponse>(`/api/tabs/${activeTabId}/cwd`);
        if (data?.cwd) {
          onCwdFolder(activeTabId, getTopLevelDir(data.cwd));
        }
      } catch {}
    };

    syncCwd();
    const interval = setInterval(syncCwd, 2000);
    return () => clearInterval(interval);
  }, [activeTabId, onCwdFolder]);

  const getActiveTabCwd = useCallback(async (): Promise<string> => {
    if (!activeTabId) return "";
    try {
      const data = await api.get<TabCwdResponse>(`/api/tabs/${activeTabId}/cwd`);
      return data.cwd || "";
    } catch {
      return "";
    }
  }, [activeTabId]);

  return { getActiveTabCwd };
}
