import { useState, useEffect, useCallback, useRef } from "react";
import { TabBar, type TabItem } from "~/components/TabBar";
import { TerminalTab, type ConnectionStatus, type TerminalActions } from "~/components/TerminalTab";
import { QuickKeysBar } from "~/components/QuickKeysBar";
import { ConfirmModal } from "~/components/ConfirmModal";
import { usePwa } from "~/hooks/usePwa";
import { PwaUpdateToast } from "~/components/PwaUpdateToast";
import { PwaOfflineBanner } from "~/components/PwaOfflineBanner";
import { FileBrowserPanel } from "~/components/FileBrowser/FileBrowserPanel";
import { TransferQueueDrawer } from "~/components/FileBrowser/TransferQueueDrawer";
import { useFileTransfer } from "~/hooks/useFileTransfer";
import { useSelfUpdate } from "~/hooks/useSelfUpdate";
import { SelfUpdateModal } from "~/components/SelfUpdateModal";
import { useNavigate } from "react-router";
import { getTheme, type KnifeTheme } from "~/utils/themes";
import { useSettings } from "~/hooks/useSettings";
import { getTopLevelDir } from "~/utils/cwd";
import { Plus } from "lucide-react";

export default function Home() {
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({});
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const theme = getTheme(settings.theme);
  const [username, setUsername] = useState<string>("");
  const [shellName, setShellName] = useState<string>("Shell");
  const [tabToClose, setTabToClose] = useState<TabItem | null>(null);
  const customTabsRef = useRef<Set<string>>(new Set());
  const closingTabsRef = useRef<Set<string>>(new Set());
  const fontSize = settings.fontSize;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("knife_file_browser_open") === "true";
    }
    return false;
  });

  const handleToggleFileBrowser = useCallback(() => {
    setIsFileBrowserOpen((prev) => {
      const next = !prev;
      localStorage.setItem("knife_file_browser_open", String(next));
      return next;
    });
  }, []);
  const [isQuickKeysBarOpen, setIsQuickKeysBarOpen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("knife_quick_keys_open");
      if (stored !== null) return stored === "true";
      return window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
    }
    return false;
  });

  const handleToggleQuickKeys = useCallback(() => {
    setIsQuickKeysBarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("knife_quick_keys_open", String(next));
      return next;
    });
  }, []);

  const terminalActionsRef = useRef<Map<string, TerminalActions>>(new Map());

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
        const actions = terminalActionsRef.current.get(activeTabId);
        actions?.sendInput(path);
      }
    },
    [activeTabId],
  );

  const handleEsc = useCallback(() => {
    if (activeTabId) {
      const actions = terminalActionsRef.current.get(activeTabId);
      actions?.sendInput("\x1b");
      actions?.focus();
    }
  }, [activeTabId]);

  const handleTabKey = useCallback(() => {
    if (activeTabId) {
      const actions = terminalActionsRef.current.get(activeTabId);
      actions?.sendInput("\t");
      actions?.focus();
    }
  }, [activeTabId]);

  const handleCtrlC = useCallback(() => {
    if (activeTabId) {
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
    }
  }, [activeTabId]);

  const handleCtrlV = useCallback(async () => {
    if (activeTabId) {
      const actions = terminalActionsRef.current.get(activeTabId);
      if (!actions) return;
      try {
        const text = await navigator.clipboard?.readText();
        if (text) {
          actions.sendInput(text);
        }
      } catch {}
      actions.focus();
    }
  }, [activeTabId]);

  const handleArrowUp = useCallback(() => {
    if (activeTabId) {
      const actions = terminalActionsRef.current.get(activeTabId);
      actions?.sendInput("\x1b[A");
      actions?.focus();
    }
  }, [activeTabId]);

  const handleArrowDown = useCallback(() => {
    if (activeTabId) {
      const actions = terminalActionsRef.current.get(activeTabId);
      actions?.sendInput("\x1b[B");
      actions?.focus();
    }
  }, [activeTabId]);
  const { transfers, uploadFiles, downloadFile, downloadArchive, cancelTransfer, clearCompleted } =
    useFileTransfer();
  const {
    status: selfUpdateStatus,
    updateInfo,
    logs: selfUpdateLogs,
    error: selfUpdateError,
    remediationCommand,
    isModalOpen: isSelfUpdateModalOpen,
    reconnectCountdown,
    checkForUpdate,
    applyUpdate,
    openModal: openSelfUpdateModal,
    closeModal: closeSelfUpdateModal,
  } = useSelfUpdate();

  const handleUploadToActiveTabCwd = useCallback(
    async (files: File[]) => {
      if (!activeTabId) return;
      try {
        const res = await fetch(`/api/tabs/${activeTabId}/cwd`);
        if (res.ok) {
          const data = await res.json();
          uploadFiles(data.cwd || "", files);
        } else {
          uploadFiles("", files);
        }
      } catch {
        uploadFiles("", files);
      }
    },
    [activeTabId, uploadFiles],
  );
  const { isInstallable, installApp, isUpdateAvailable, updateApp, dismissUpdate, isOnline } =
    usePwa();
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleIncreaseFontSize = useCallback(() => {
    updateSettings({ fontSize: Math.min(32, settings.fontSize + 1) });
  }, [settings.fontSize, updateSettings]);

  const handleDecreaseFontSize = useCallback(() => {
    updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) });
  }, [settings.fontSize, updateSettings]);

  const handleResetFontSize = useCallback(() => {
    updateSettings({ fontSize: 15 });
  }, [updateSettings]);

  const handleSelectTheme = useCallback(
    (themeId: string) => {
      updateSettings({ theme: themeId });
    },
    [updateSettings],
  );

  // Fetch initial tabs and user profile
  useEffect(() => {
    // Fetch user
    fetch("/api/me")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.authenticated) {
          setUsername(data.username);
          if (data.shellName) {
            setShellName(data.shellName);
          }
        }
      })
      .catch(() => {});

    // Fetch tabs
    fetch("/api/tabs")
      .then((res) => {
        if (res.status === 401) {
          window.location.href = "/login";
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setTabs(data);
          if (data.length > 0) {
            setActiveTabId(data[0].id);
            for (const tab of data) {
              fetch(`/api/tabs/${tab.id}/cwd`)
                .then((r) => r.json())
                .then((d) => {
                  if (d?.cwd) {
                    const top = getTopLevelDir(d.cwd);
                    setTabs((prev) =>
                      prev.map((t) =>
                        t.id === tab.id && !customTabsRef.current.has(t.id)
                          ? { ...t, name: top }
                          : t,
                      ),
                    );
                  }
                })
                .catch(() => {});
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  // Sync active tab title with CWD top-level folder
  useEffect(() => {
    if (!activeTabId) return;

    const syncCwd = async () => {
      try {
        const res = await fetch(`/api/tabs/${activeTabId}/cwd`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.cwd) return;

        const topLevel = getTopLevelDir(data.cwd);
        setTabs((prev) =>
          prev.map((t) => {
            if (t.id !== activeTabId) return t;
            if (customTabsRef.current.has(t.id)) return t;
            if (t.name === topLevel) return t;
            return { ...t, name: topLevel };
          }),
        );
      } catch {}
    };

    syncCwd();
    const interval = setInterval(syncCwd, 2000);
    return () => clearInterval(interval);
  }, [activeTabId]);

  // Create new tab
  const handleCreateTab = useCallback(() => {
    const nextIndex = tabs.length + 1;
    fetch("/api/tabs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${shellName} ${nextIndex}` }),
    })
      .then((res) => res.json())
      .then((newTab: TabItem) => {
        if (newTab && newTab.id) {
          customTabsRef.current.delete(newTab.id);
          setTabs((prev) => [...prev, newTab]);
          setActiveTabId(newTab.id);
        }
      })
      .catch((err) => console.error("Failed to create tab:", err));
  }, [tabs.length, shellName]);

  // Request tab close (opens confirmation modal)
  const handleRequestCloseTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab) {
        setTabToClose(tab);
      }
    },
    [tabs],
  );

  // Execute tab close
  const executeCloseTab = useCallback(
    (closedId: string) => {
      if (closingTabsRef.current.has(closedId)) return;
      closingTabsRef.current.add(closedId);

      customTabsRef.current.delete(closedId);
      terminalActionsRef.current.delete(closedId);
      setTabToClose((prev) => (prev?.id === closedId ? null : prev));

      // Calculate adjacent active tab before deletion
      let nextActiveId = activeTabId;
      if (activeTabId === closedId) {
        const index = tabs.findIndex((t) => t.id === closedId);
        if (index > 0) {
          nextActiveId = tabs[index - 1].id;
        } else if (tabs.length > 1) {
          nextActiveId = tabs[1].id;
        } else {
          nextActiveId = "";
        }
      }

      fetch(`/api/tabs/${closedId}`, {
        method: "DELETE",
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.remainingTabs)) {
            setTabs(data.remainingTabs);
            if (activeTabId === closedId) {
              const exists = data.remainingTabs.some((t: TabItem) => t.id === nextActiveId);
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

  // Confirm tab close
  const handleConfirmCloseTab = () => {
    if (!tabToClose) return;
    executeCloseTab(tabToClose.id);
  };

  const handleProcessExit = useCallback(
    (tabId: string) => {
      executeCloseTab(tabId);
    },
    [executeCloseTab],
  );

  // Rename tab
  const handleRenameTab = (id: string, newName: string) => {
    customTabsRef.current.add(id);
    fetch(`/api/tabs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    })
      .then((res) => res.json())
      .then((updated: TabItem) => {
        setTabs((prev) =>
          prev.map((t) => (t.id === id ? { ...t, name: updated.name || newName } : t)),
        );
      })
      .catch((err) => console.error("Failed to rename tab:", err));
  };

  // Reorder tabs
  const handleReorderTabs = (newTabs: TabItem[]) => {
    setTabs(newTabs);
    fetch("/api/tabs/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tabIds: newTabs.map((t) => t.id) }),
    }).catch((err) => console.error("Failed to reorder tabs:", err));
  };

  // Logout
  const handleLogout = () => {
    window.location.href = "/auth/logout";
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a form input/textarea (exempt xterm hidden helper textarea)
      const activeEl = document.activeElement;
      const isXtermHelper = activeEl?.classList.contains("xterm-helper-textarea");
      if ((activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA") && !isXtermHelper) {
        return;
      }

      // Alt + F: Toggle fullscreen
      if (e.altKey && !e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        handleToggleFullscreen();
        return;
      }
      // Ctrl/Cmd + E: Toggle File Browser
      if ((e.ctrlKey || e.metaKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        handleToggleFileBrowser();
        return;
      }

      // Ctrl/Cmd + + / =: Increase font size
      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        handleIncreaseFontSize();
        return;
      }

      // Ctrl/Cmd + -: Decrease font size
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        handleDecreaseFontSize();
        return;
      }

      // Ctrl/Cmd + 0: Reset font size
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        handleResetFontSize();
        return;
      }

      // Cmd/Ctrl + ,: Open Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        navigate("/settings");
        return;
      }

      // Alt + T: New tab
      if (e.altKey && !e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        handleCreateTab();
        return;
      }

      // Alt + W: Close active tab
      if (e.altKey && !e.shiftKey && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        if (activeTabId) {
          handleRequestCloseTab(activeTabId);
        }
        return;
      }

      // Alt + 1..9: Switch tab
      if (e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (index >= 0 && index < tabs.length) {
          setActiveTabId(tabs[index].id);
        }
        return;
      }

      // Alt + Left / Right: Previous / Next tab
      if (e.altKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex === -1) return;
        const delta = e.key === "ArrowLeft" ? -1 : 1;
        const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
        setActiveTabId(tabs[nextIndex].id);
        return;
      }

      // Alt + Shift + Left / Right: Move tab left / right
      if (e.altKey && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        if (currentIndex === -1) return;
        const targetIndex = e.key === "ArrowLeft" ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex >= 0 && targetIndex < tabs.length) {
          const newTabs = [...tabs];
          const [moved] = newTabs.splice(currentIndex, 1);
          newTabs.splice(targetIndex, 0, moved);
          handleReorderTabs(newTabs);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    tabs,
    activeTabId,
    handleCreateTab,
    handleRequestCloseTab,
    handleToggleFullscreen,
    handleIncreaseFontSize,
    handleDecreaseFontSize,
    handleResetFontSize,
    handleToggleFileBrowser,
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-base)]">
      {!isOnline && <PwaOfflineBanner />}
      {/* Top Tab Bar */}
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        statuses={statuses}
        theme={theme}
        compact={settings.compactTabs}
        fontSize={fontSize}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        onResetFontSize={handleResetFontSize}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        username={username}
        onSelectTab={setActiveTabId}
        onCreateTab={handleCreateTab}
        onCloseTab={handleRequestCloseTab}
        onRenameTab={handleRenameTab}
        onReorderTabs={handleReorderTabs}
        onSelectTheme={handleSelectTheme}
        onLogout={handleLogout}
        isInstallable={isInstallable}
        onInstallApp={installApp}
        isFileBrowserOpen={isFileBrowserOpen}
        onToggleFileBrowser={handleToggleFileBrowser}
        isQuickKeysOpen={isQuickKeysBarOpen}
        onToggleQuickKeys={handleToggleQuickKeys}
        updateAvailable={updateInfo?.updateAvailable}
        latestVersion={updateInfo?.latestVersion}
        onOpenUpdateModal={openSelfUpdateModal}
      />
      {/* Main Workspace: Split pane / Drawer + Terminal Viewport */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <FileBrowserPanel
          isOpen={isFileBrowserOpen}
          onClose={() => {
            setIsFileBrowserOpen(false);
            localStorage.setItem("knife_file_browser_open", "false");
          }}
          activeTabId={activeTabId}
          onInsertTerminalPath={handleInsertTerminalPath}
          onUpload={uploadFiles}
          onDownloadFile={downloadFile}
          onDownloadArchive={downloadArchive}
        />

        {/* Terminal Viewport Container */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <main className="flex-1 relative overflow-hidden">
            {tabs.map((tab) => (
              <TerminalTab
                key={tab.id}
                tabId={tab.id}
                isActive={tab.id === activeTabId}
                theme={theme}
                fontSize={fontSize}
                fontFamily={settings.fontFamily}
                lineHeight={settings.lineHeight}
                cursorStyle={settings.cursorStyle}
                cursorBlink={settings.cursorBlink}
                scrollback={settings.scrollback}
                copyOnSelect={settings.copyOnSelect}
                bellStyle={settings.bellStyle}
                onProcessExit={handleProcessExit}
                onStatusChange={(status) => {
                  setStatuses((prev) => ({ ...prev, [tab.id]: status }));
                }}
                onUploadToCwd={handleUploadToActiveTabCwd}
                onRegisterActions={handleRegisterTerminalActions}
              />
            ))}

            {tabs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--fg-muted)]">
                <p className="text-sm">No active tabs</p>
                <button
                  type="button"
                  onClick={handleCreateTab}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Terminal
                </button>
              </div>
            )}
          </main>

          {isQuickKeysBarOpen && tabs.length > 0 && (
            <QuickKeysBar
              onEsc={handleEsc}
              onTab={handleTabKey}
              onCtrlC={handleCtrlC}
              onCtrlV={handleCtrlV}
              onArrowUp={handleArrowUp}
              onArrowDown={handleArrowDown}
              onClose={() => {
                setIsQuickKeysBarOpen(false);
                localStorage.setItem("knife_quick_keys_open", "false");
              }}
            />
          )}
        </div>
      </div>

      {/* Floating Transfer Queue Drawer */}
      <TransferQueueDrawer
        transfers={transfers}
        onCancel={cancelTransfer}
        onClearCompleted={clearCompleted}
      />

      {/* Close Tab Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(tabToClose)}
        title="Close Terminal Tab"
        message={`Are you sure you want to close "${tabToClose?.name}"? Any running shell processes inside this tab will be terminated.`}
        confirmText="Close Tab"
        cancelText="Cancel"
        onConfirm={handleConfirmCloseTab}
        onCancel={() => setTabToClose(null)}
      />

      {isUpdateAvailable && <PwaUpdateToast onUpdate={updateApp} onDismiss={dismissUpdate} />}
      {/* Host Daemon Self-Update Modal */}
      <SelfUpdateModal
        isOpen={isSelfUpdateModalOpen}
        status={selfUpdateStatus}
        updateInfo={updateInfo}
        logs={selfUpdateLogs}
        error={selfUpdateError}
        remediationCommand={remediationCommand}
        reconnectCountdown={reconnectCountdown}
        onClose={closeSelfUpdateModal}
        onApplyUpdate={applyUpdate}
        onCheckForUpdate={checkForUpdate}
      />
    </div>
  );
}
