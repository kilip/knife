import { useState, useEffect, useCallback } from "react";
import { getSerwist } from "virtual:serwist";
import type { Serwist } from "@serwist/window";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwa() {
  const [serwistInstance, setSerwistInstance] = useState<Serwist | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Detect standalone mode
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as unknown as { standalone?: boolean }).standalone);
      setIsStandalone(isStandaloneMode);
    };
    checkStandalone();

    // Online / Offline tracking
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Capture install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Register Serwist
    const initSerwist = async () => {
      if ("serviceWorker" in navigator) {
        const sw = await getSerwist();
        if (sw) {
          setSerwistInstance(sw);

          sw.addEventListener("waiting", () => {
            setIsUpdateAvailable(true);
          });

          sw.addEventListener("installed", (event) => {
            if (event.isUpdate) {
              setIsUpdateAvailable(true);
            }
          });

          await sw.register();
        }
      }
    };
    initSerwist().catch(() => {});

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallPromptEvent(null);
    }
  }, [installPromptEvent]);

  const updateApp = useCallback(() => {
    if (serwistInstance) {
      serwistInstance.messageSkipWaiting();
    }
    window.location.reload();
  }, [serwistInstance]);

  const dismissUpdate = useCallback(() => {
    setIsUpdateAvailable(false);
  }, []);

  return {
    isInstallable: Boolean(installPromptEvent) && !isStandalone,
    installApp,
    isUpdateAvailable,
    updateApp,
    dismissUpdate,
    isStandalone,
    isOnline,
  };
}
