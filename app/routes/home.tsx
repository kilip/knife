import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ConfirmModal } from "~/components/ui/ConfirmModal";
import { FileBrowserPanel } from "~/features/file-browser/FileBrowserPanel";
import { TransferQueueDrawer } from "~/features/file-browser/TransferQueueDrawer";
import { useFileTransfer } from "~/features/file-browser/useFileTransfer";
import { PwaOfflineBanner } from "~/features/pwa/PwaOfflineBanner";
import { PwaUpdateToast } from "~/features/pwa/PwaUpdateToast";
import { usePwa } from "~/features/pwa/usePwa";
import { useSettings } from "~/features/settings/useSettings";
import { TabBar } from "~/features/tabs/TabBar";
import { useTabCwd } from "~/features/tabs/useTabCwd";
import { useTabs } from "~/features/tabs/useTabs";
import { QuickKeysBar } from "~/features/terminal/QuickKeysBar";
import { TerminalTab } from "~/features/terminal/TerminalTab";
import { useKeyboardShortcuts } from "~/features/terminal/useKeyboardShortcuts";
import { useTheme } from "~/features/theme/useTheme";
import { SelfUpdateModal } from "~/features/update/SelfUpdateModal";
import { useSelfUpdate } from "~/features/update/useSelfUpdate";
import { STORAGE_KEYS, usePersistentState } from "~/lib/use-persistent-state";

export default function Home() {
  const navigate = useNavigate();
  const { settings, updateSettings } = useSettings();
  const { theme, username, shellName, handleSelectTheme } = useTheme({
    themeId: settings.theme,
    updateSettings,
  });
  const tabState = useTabs(shellName);

  const { getActiveTabCwd } = useTabCwd({
    activeTabId: tabState.activeTabId,
    onCwdFolder: tabState.setTabTitleFromCwd,
  });
  const { transfers, uploadFiles, downloadFile, downloadArchive, cancelTransfer, clearCompleted } =
    useFileTransfer();
  const selfUpdate = useSelfUpdate();
  const { isInstallable, installApp, isUpdateAvailable, updateApp, dismissUpdate, isOnline } =
    usePwa();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFileBrowserOpen, setIsFileBrowserOpen] = usePersistentState<boolean>(
    STORAGE_KEYS.FILE_BROWSER_OPEN,
    false,
  );
  const [isQuickKeysBarOpen, setIsQuickKeysBarOpen] = usePersistentState<boolean>(
    STORAGE_KEYS.QUICK_KEYS_OPEN,
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px), (pointer: coarse)").matches,
  );

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleToggleFileBrowser = useCallback(
    () => setIsFileBrowserOpen((prev) => !prev),
    [setIsFileBrowserOpen],
  );
  const handleToggleQuickKeys = useCallback(
    () => setIsQuickKeysBarOpen((prev) => !prev),
    [setIsQuickKeysBarOpen],
  );
  const handleIncreaseFontSize = useCallback(
    () => updateSettings({ fontSize: Math.min(32, settings.fontSize + 1) }),
    [settings.fontSize, updateSettings],
  );
  const handleDecreaseFontSize = useCallback(
    () => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) }),
    [settings.fontSize, updateSettings],
  );
  const handleResetFontSize = useCallback(() => updateSettings({ fontSize: 15 }), [updateSettings]);
  const handleUploadToActiveTabCwd = useCallback(
    async (files: File[]) => uploadFiles(await getActiveTabCwd(), files),
    [getActiveTabCwd, uploadFiles],
  );

  useKeyboardShortcuts({
    activeTabId: tabState.activeTabId,
    onCreateTab: tabState.handleCreateTab,
    onRequestCloseTab: tabState.handleRequestCloseTab,
    onSelectTabByIndex: tabState.handleSelectTabByIndex,
    onCycleTab: tabState.handleCycleTab,
    onMoveTab: tabState.handleMoveTab,
    onToggleFullscreen: handleToggleFullscreen,
    onToggleFileBrowser: handleToggleFileBrowser,
    onIncreaseFontSize: handleIncreaseFontSize,
    onDecreaseFontSize: handleDecreaseFontSize,
    onResetFontSize: handleResetFontSize,
    onOpenSettings: useCallback(() => navigate("/settings"), [navigate]),
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-base)]">
      {!isOnline && <PwaOfflineBanner />}
      <TabBar
        tabs={tabState.tabs}
        activeTabId={tabState.activeTabId}
        statuses={tabState.statuses}
        theme={theme}
        compact={settings.compactTabs}
        fontSize={settings.fontSize}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        onResetFontSize={handleResetFontSize}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        username={username}
        onSelectTab={tabState.setActiveTabId}
        onCreateTab={tabState.handleCreateTab}
        onCloseTab={tabState.handleRequestCloseTab}
        onRenameTab={tabState.handleRenameTab}
        onReorderTabs={tabState.handleReorderTabs}
        onSelectTheme={handleSelectTheme}
        onLogout={() => {
          window.location.href = "/auth/logout";
        }}
        isInstallable={isInstallable}
        onInstallApp={installApp}
        isFileBrowserOpen={isFileBrowserOpen}
        onToggleFileBrowser={handleToggleFileBrowser}
        isQuickKeysOpen={isQuickKeysBarOpen}
        onToggleQuickKeys={handleToggleQuickKeys}
        updateAvailable={selfUpdate.updateInfo?.updateAvailable}
        latestVersion={selfUpdate.updateInfo?.latestVersion}
        onOpenUpdateModal={selfUpdate.openModal}
      />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <FileBrowserPanel
          isOpen={isFileBrowserOpen}
          onClose={() => setIsFileBrowserOpen(false)}
          activeTabId={tabState.activeTabId}
          onInsertTerminalPath={tabState.handleInsertTerminalPath}
          onUpload={uploadFiles}
          onDownloadFile={downloadFile}
          onDownloadArchive={downloadArchive}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <main className="flex-1 relative overflow-hidden">
            {tabState.tabs.map((tab) => (
              <TerminalTab
                key={tab.id}
                tabId={tab.id}
                isActive={tab.id === tabState.activeTabId}
                theme={theme}
                fontSize={settings.fontSize}
                fontFamily={settings.fontFamily}
                lineHeight={settings.lineHeight}
                cursorStyle={settings.cursorStyle}
                cursorBlink={settings.cursorBlink}
                scrollback={settings.scrollback}
                copyOnSelect={settings.copyOnSelect}
                bellStyle={settings.bellStyle}
                onProcessExit={tabState.handleProcessExit}
                onStatusChange={(status) => tabState.setTabStatus(tab.id, status)}
                onUploadToCwd={handleUploadToActiveTabCwd}
                onRegisterActions={tabState.handleRegisterTerminalActions}
              />
            ))}

            {tabState.tabs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--fg-muted)]">
                <p className="text-sm">No active tabs</p>
                <button
                  type="button"
                  onClick={tabState.handleCreateTab}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[var(--accent)] text-[var(--bg-base)] hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Terminal
                </button>
              </div>
            )}
          </main>

          {isQuickKeysBarOpen && tabState.tabs.length > 0 && (
            <QuickKeysBar
              onEsc={() => tabState.sendQuickKey("\x1b")}
              onTab={() => tabState.sendQuickKey("\t")}
              onCtrlC={tabState.handleCtrlC}
              onCtrlV={tabState.handleCtrlV}
              onArrowUp={() => tabState.sendQuickKey("\x1b[A")}
              onArrowDown={() => tabState.sendQuickKey("\x1b[B")}
              onClose={() => setIsQuickKeysBarOpen(false)}
            />
          )}
        </div>
      </div>

      <TransferQueueDrawer
        transfers={transfers}
        onCancel={cancelTransfer}
        onClearCompleted={clearCompleted}
      />

      <ConfirmModal
        isOpen={Boolean(tabState.tabToClose)}
        title="Close Terminal Tab"
        message={`Are you sure you want to close "${tabState.tabToClose?.name}"? Any running shell processes inside this tab will be terminated.`}
        confirmText="Close Tab"
        cancelText="Cancel"
        onConfirm={tabState.handleConfirmCloseTab}
        onCancel={() => tabState.setTabToClose(null)}
      />

      {isUpdateAvailable && <PwaUpdateToast onUpdate={updateApp} onDismiss={dismissUpdate} />}
      <SelfUpdateModal
        isOpen={selfUpdate.isModalOpen}
        status={selfUpdate.status}
        updateInfo={selfUpdate.updateInfo}
        logs={selfUpdate.logs}
        error={selfUpdate.error}
        remediationCommand={selfUpdate.remediationCommand}
        reconnectCountdown={selfUpdate.reconnectCountdown}
        onClose={selfUpdate.closeModal}
        onApplyUpdate={selfUpdate.applyUpdate}
        onCheckForUpdate={selfUpdate.checkForUpdate}
      />
    </div>
  );
}
