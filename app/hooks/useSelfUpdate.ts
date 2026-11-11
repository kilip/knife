import { useState, useEffect, useCallback, useRef } from "react";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  cached?: boolean;
  isService: boolean;
  isTmux: boolean;
  activeTabsCount: number;
  command: string;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "updating"
  | "restarting"
  | "error";

export function useSelfUpdate() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [remediationCommand, setRemediationCommand] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check for updates
  const checkForUpdate = useCallback(async (force: boolean = false) => {
    setStatus("checking");
    setError(null);
    try {
      const res = await fetch(`/api/system/update/check${force ? "?force=true" : ""}`);
      if (!res.ok) {
        throw new Error(`Failed to check updates (HTTP ${res.status})`);
      }
      const data: UpdateInfo = await res.json();
      setUpdateInfo(data);
      if (data.command) {
        setRemediationCommand(data.command);
      }
      if (data.updateAvailable) {
        setStatus("available");
      } else {
        setStatus("up-to-date");
      }
      return data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
      return null;
    }
  }, []);

  // Poll server health until it comes back online, then reload window
  const startReconnectPolling = useCallback(() => {
    setStatus("restarting");
    setReconnectCountdown(15);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    countdownTimerRef.current = setInterval(() => {
      setReconnectCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const attempt = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.status === "ok") {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            window.location.reload();
            return;
          }
        }
      } catch {
        // server not back yet
      }
      pollTimerRef.current = setTimeout(attempt, 1500);
    };

    // First check after 2 seconds
    pollTimerRef.current = setTimeout(attempt, 2000);
  }, []);

  // Apply update via SSE stream
  const applyUpdate = useCallback(async () => {
    setStatus("updating");
    setLogs(["[client] Initiating update request..."]);
    setError(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/system/update/apply", {
        method: "POST",
        signal: controller.signal,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      if (!res.body) {
        throw new Error("No response body received for event stream");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const block of events) {
          if (!block.trim()) continue;

          let eventType = "message";
          let dataStr = "";

          const lines = block.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.slice("data:".length).trim();
            }
          }

          if (!dataStr) continue;

          try {
            const data = JSON.parse(dataStr);
            if (eventType === "log" && data.line) {
              setLogs((prev) => [...prev, data.line]);
            } else if (eventType === "error") {
              setError(data.error || "Update failed");
              if (data.remediationCommand) {
                setRemediationCommand(data.remediationCommand);
              }
              setStatus("error");
              return;
            } else if (eventType === "complete") {
              setLogs((prev) => [
                ...prev,
                data.message || "[client] Update successful, restarting...",
              ]);
              startReconnectPolling();
              return;
            }
          } catch {
            // raw string fallback
            setLogs((prev) => [...prev, dataStr]);
          }
        }
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
      setLogs((prev) => [...prev, `[client error] ${msg}`]);
    }
  }, [startReconnectPolling]);

  // Initial check on mount
  useEffect(() => {
    checkForUpdate(false);

    return () => {
      abortControllerRef.current?.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [checkForUpdate]);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    // Prevent closing while updating or restarting
    if (status === "updating" || status === "restarting") return;
    setIsModalOpen(false);
  }, [status]);

  return {
    status,
    updateInfo,
    logs,
    error,
    remediationCommand,
    isModalOpen,
    reconnectCountdown,
    checkForUpdate,
    applyUpdate,
    openModal,
    closeModal,
  };
}
