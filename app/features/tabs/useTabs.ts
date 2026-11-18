import type { TabCwdResponse } from "@shared/api";
import type { TabData } from "@shared/tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import { getTopLevelDir } from "~/features/tabs/cwd";
import type { ConnectionStatus, TerminalActions } from "~/features/terminal/TerminalTab";
import { ApiError, api } from "~/lib/api";

export function moveTabInList(
  tabs: TabData[],
  activeTabId: string,
  direction: "left" | "right",
): TabData[] | null {
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
  if (currentIndex === -1) return null;
  const targetIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= tabs.length) return null;

  const nextTabs = [...tabs];
  const [moved] = nextTabs.splice(currentIndex, 1);
  nextTabs.splice(targetIndex, 0, moved);
  return nextTabs.map((t, idx) => ({ ...t, order: idx }));
}

export function getAdjacentTabId(
  tabs: TabData[],
  activeTabId: string,
  direction: "prev" | "next",
): string | null {
  if (tabs.length === 0) return null;
  const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
  if (currentIndex === -1) return null;
  const delta = direction === "prev" ? -1 : 1;
  const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
  return tabs[nextIndex].id;
}

export function getNextActiveTabIdAfterClose(
  tabs: TabData[],
  activeTabId: string,
  closedId: string,
): string {
  if (activeTabId !== closedId) {
    return activeTabId;
  }
  const index = tabs.findIndex((t) => t.id === closedId);
  if (index > 0) {
    return tabs[index - 1].id;
  }
  if (tabs.length > 1) {
    return tabs[1].id;
  }
  return "";
}

export function useTabs(shellName: string) {
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [tabToClose, setTabToClose] = useState<TabData | null>(null);
  const customTabsRef = useRef<Set<string>>(new Set());
  const closingTabsRef = useRef<Set<string>>(new Set());
  const terminalActionsRef = useRef<Map<string, TerminalActions>>(new Map());

  const setTabTitleFromCwd = useCallback((tabId: string, topLevel: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        if (customTabsRef.current.has(t.id)) return t;
        if (t.name === topLevel) return t;
        return { ...t, name: topLevel };
      }),
    );
  }, []);

  useEffect(() => {
    api
      .get<TabData[]>("/api/tabs")
      .then((data) => {
        if (Array.isArray(data)) {
          setTabs(data);
          if (data.length > 0) {
            setActiveTabId(data[0].id);
            for (const tab of data) {
              api
                .get<TabCwdResponse>(`/api/tabs/${tab.id}/cwd`)
                .then((d) => {
                  if (d?.cwd) {
                    setTabTitleFromCwd(tab.id, getTopLevelDir(d.cwd));
                  }
                })
                .catch(() => {});
            }
          }
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = "/login";
        }
      });
  }, [setTabTitleFromCwd]);

  const handleCreateTab = useCallback(() => {
    const nextIndex = tabs.length + 1;
    api
      .post<TabData>("/api/tabs", { name: `${shellName} ${nextIndex}` })
      .then((newTab) => {
        if (newTab?.id) {
          customTabsRef.current.delete(newTab.id);
          setTabs((prev) => [...prev, newTab]);
          setActiveTabId(newTab.id);
        }
      })
      .catch((err) => console.error("Failed to create tab:", err));
  }, [tabs.length, shellName]);

  const handleRequestCloseTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab) {
        setTabToClose(tab);
      }
    },
    [tabs],
  );

  const executeCloseTab = useCallback(
    (closedId: string) => {
      if (closingTabsRef.current.has(closedId)) return;
      closingTabsRef.current.add(closedId);

      customTabsRef.current.delete(closedId);
      terminalActionsRef.current.delete(closedId);
      setTabToClose((prev) => (prev?.id === closedId ? null : prev));

      const nextActiveId = getNextActiveTabIdAfterClose(tabs, activeTabId, closedId);

      api
        .delete<{ remainingTabs?: TabData[] }>(`/api/tabs/${closedId}`)
        .then((data) => {
          if (Array.isArray(data.remainingTabs)) {
            setTabs(data.remainingTabs);
            if (activeTabId === closedId) {
              const exists = data.remainingTabs.some((t: TabData) => t.id === nextActiveId);
              setActiveTabId(exists ? nextActiveId : data.remainingTabs[0]?.id || "");
            }
          } else {
            setTabs((prev) => {
              const next = prev.filter((t) => t.id !== closedId);
              if (activeTabId === closedId) {
                const exists = next.some((t) => t.id === nextActiveId);
                setActiveTabId(exists ? nextActiveId : next[0]?.id || "");
              }
              return next;
            });
          }
        })
        .catch((err) => console.error("Failed to delete tab:", err))
        .finally(() => {
          closingTabsRef.current.delete(closedId);
        });
    },
    [activeTabId, tabs],
  );

  const handleConfirmCloseTab = useCallback(() => {
    if (!tabToClose) return;
    executeCloseTab(tabToClose.id);
  }, [tabToClose, executeCloseTab]);

  const handleProcessExit = useCallback(
    (tabId: string) => {
      executeCloseTab(tabId);
    },
    [executeCloseTab],
  );

  const handleRenameTab = useCallback((id: string, newName: string) => {
    customTabsRef.current.add(id);
    api
      .patch<TabData>(`/api/tabs/${id}`, { name: newName })
      .then((updated) => {
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: updated.name || newName } : t)),
        );
      })
      .catch((err) => console.error("Failed to rename tab:", err));
  }, []);

  const handleReorderTabs = useCallback((newTabs: TabData[]) => {
    setTabs(newTabs);
    api
      .post("/api/tabs/reorder", { tabIds: newTabs.map((t) => t.id) })
      .catch((err) => console.error("Failed to reorder tabs:", err));
  }, []);

  const handleSelectTabByIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < tabs.length) {
        setActiveTabId(tabs[index].id);
      }
    },
    [tabs],
  );

  const handleCycleTab = useCallback(
    (direction: "prev" | "next") => {
      const nextId = getAdjacentTabId(tabs, activeTabId, direction);
      if (nextId) {
        setActiveTabId(nextId);
      }
    },
    [tabs, activeTabId],
  );

  const handleMoveTab = useCallback(
    (direction: "left" | "right") => {
      const reordered = moveTabInList(tabs, activeTabId, direction);
      if (reordered) {
        handleReorderTabs(reordered);
      }
    },
    [tabs, activeTabId, handleReorderTabs],
  );

  const setTabStatus = useCallback((tabId: string, status: ConnectionStatus) => {
    setStatuses((prev) => ({ ...prev, [tabId]: status }));
  }, []);

  const handleRegisterTerminalActions = useCallback(
    (tabId: string, actions: TerminalActions | null) => {
      if (actions) {
        terminalActionsRef.current.set(tabId, actions);
      } else {
        terminalActionsRef.current.delete(tabId);
      }
    },
    [],
  );

  const handleInsertTerminalPath = useCallback(
    (path: string) => {
      if (activeTabId) {
        terminalActionsRef.current.get(activeTabId)?.sendInput(path);
      }
    },
    [activeTabId],
  );

  const sendQuickKey = useCallback(
    (sequence: string) => {
      if (!activeTabId) return;
      const actions = terminalActionsRef.current.get(activeTabId);
      actions?.sendInput(sequence);
      actions?.focus();
    },
    [activeTabId],
  );

  const handleCtrlC = useCallback(() => {
    if (!activeTabId) return;
    const actions = terminalActionsRef.current.get(activeTabId);
    if (!actions) return;
    if (actions.hasSelection()) {
      const selected = actions.getSelection();
      if (selected) {
        navigator.clipboard?.writeText(selected).catch(() => {});
        actions.clearSelection();
      }
    } else {
      actions.sendInput("\x03");
    }
    actions.focus();
  }, [activeTabId]);

  const handleCtrlV = useCallback(async () => {
    if (!activeTabId) return;
    const actions = terminalActionsRef.current.get(activeTabId);
    if (!actions) return;
    try {
      const text = await navigator.clipboard?.readText();
      if (text) {
        actions.sendInput(text);
      }
    } catch {}
    actions.focus();
  }, [activeTabId]);

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    statuses,
    setTabStatus,
    tabToClose,
    setTabToClose,
    setTabTitleFromCwd,
    handleCreateTab,
    handleRequestCloseTab,
    handleConfirmCloseTab,
    handleProcessExit,
    handleRenameTab,
    handleReorderTabs,
    handleSelectTabByIndex,
    handleCycleTab,
    handleMoveTab,
    handleRegisterTerminalActions,
    handleInsertTerminalPath,
    sendQuickKey,
    handleCtrlC,
    handleCtrlV,
  };
}
