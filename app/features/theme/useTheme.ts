import type { MeResponse } from "@shared/api";
import { useCallback, useEffect, useState } from "react";
import type { UserSettings } from "~/features/settings/useSettings";
import { getTheme } from "~/features/theme/themes";
import { ApiError, api } from "~/lib/api";

interface UseThemeOptions {
  themeId: string;
  updateSettings: (patch: Partial<UserSettings>) => Promise<UserSettings>;
}

export function useTheme({ themeId, updateSettings }: UseThemeOptions) {
  const theme = getTheme(themeId);
  const [username, setUsername] = useState<string>("");
  const [shellName, setShellName] = useState<string>("Shell");

  useEffect(() => {
    api
      .get<MeResponse>("/api/me")
      .then((data) => {
        if (data?.authenticated && data.username) {
          setUsername(data.username);
          if (data.shellName) {
            setShellName(data.shellName);
          }
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
        }
      });
  }, []);

  const handleSelectTheme = useCallback(
    (nextThemeId: string) => {
      updateSettings({ theme: nextThemeId });
    },
    [updateSettings],
  );

  return { theme, username, shellName, handleSelectTheme };
}
