import { useState, useRef, useEffect } from "react";
import {
  Plus,
  X,
  LogOut,
  Keyboard,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  Folder,
  ArrowUpCircle,
  Command,
} from "lucide-react";
import { StatusIndicator } from "./StatusIndicator";
import { ThemeSelector } from "./ThemeSelector";
import { PwaInstallButton } from "./PwaInstallButton";
import type { ConnectionStatus } from "./TerminalTab";
import type { KnifeTheme } from "~/utils/themes";

export interface TabItem {
  id: string;
  name: string;
  sessionName: string;
  order: number;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTabId: string;
  statuses: Record<string, ConnectionStatus>;
  theme: KnifeTheme;
  username?: string;
  fontSize: number;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onResetFontSize: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSelectTab: (id: string) => void;
  onCreateTab: () => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, newName: string) => void;
  onReorderTabs: (newTabs: TabItem[]) => void;
  onSelectTheme: (themeId: string) => void;
  onLogout: () => void;
  isInstallable?: boolean;
  onInstallApp?: () => void;
  isFileBrowserOpen?: boolean;
  onToggleFileBrowser?: () => void;
  isQuickKeysOpen?: boolean;
  onToggleQuickKeys?: () => void;
  updateAvailable?: boolean;
  latestVersion?: string;
  onOpenUpdateModal?: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  statuses,
  theme,
  username,
  fontSize,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onResetFontSize,
  isFullscreen,
  onToggleFullscreen,
  onSelectTab,
  onCreateTab,
  onCloseTab,
  onRenameTab,
  onReorderTabs,
  onSelectTheme,
  onLogout,
  isInstallable,
  onInstallApp,
  isFileBrowserOpen,
  onToggleFileBrowser,
  isQuickKeysOpen,
  onToggleQuickKeys,
  updateAvailable,
  latestVersion,
  onOpenUpdateModal,
}: TabBarProps) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const handleStartRename = (tab: TabItem) => {
    setEditingTabId(tab.id);
    setEditName(tab.name);
  };

  const handleFinishRename = () => {
    if (editingTabId && editName.trim()) {
      onRenameTab(editingTabId, editName.trim());
    }
    setEditingTabId(null);
  };

  const handleMoveTab = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= tabs.length) return;
    const newTabs = [...tabs];
    const [moved] = newTabs.splice(index, 1);
    newTabs.splice(targetIndex, 0, moved);
    onReorderTabs(newTabs);
  };

  return (
    <header className="h-11 border-b border-[var(--border)] bg-[var(--bg-surface)] flex items-center justify-between px-2 select-none shrink-0 gap-2">
      {/* Brand & Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto h-full scrollbar-none py-1">
        <div className="flex items-center gap-1.5 px-2 text-[var(--accent)] font-bold text-sm tracking-wide mr-1">
          <span className="text-sm select-none" role="img" aria-label="knife">
            🔪
          </span>
          <span className="font-mono">knife</span>
        </div>

        {/* Tab list */}
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const status = statuses[tab.id] || "connecting";
          const isEditing = editingTabId === tab.id;

          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onDoubleClick={() => handleStartRename(tab)}
              className={`group flex items-center gap-2 px-3 h-8.5 rounded-lg text-xs font-medium cursor-pointer transition-colors relative border ${
                isActive
                  ? "bg-[var(--bg-base)] text-[var(--fg-base)] border-[var(--border)] shadow-xs"
                  : "bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] border-transparent"
              }`}
            >
              {/* Shortcut index tag */}
              <span className="text-[10px] opacity-40 font-mono">
                {index + 1 <= 9 ? `${index + 1}` : ""}
              </span>

              {/* Status dot */}
              <StatusIndicator status={status} />

              {/* Tab title or rename input */}
              {isEditing ? (
                <input
                  ref={editInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleFinishRename();
                    if (e.key === "Escape") setEditingTabId(null);
                  }}
                  className="bg-transparent border-b border-[var(--accent)] outline-none text-xs w-24 px-0.5 text-[var(--fg-base)]"
                />
              ) : (
                <span
                  className="max-w-[120px] truncate"
                  title={`${tab.name} (Double-click to rename)`}
                >
                  {tab.name}
                </span>
              )}

              {/* Reorder buttons (visible on hover) */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                {index > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveTab(index, -1);
                    }}
                    title="Move tab left (Alt+Shift+Left)"
                    className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
                  >
                    <ArrowLeft className="w-2.5 h-2.5" />
                  </button>
                )}
                {index < tabs.length - 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveTab(index, 1);
                    }}
                    title="Move tab right (Alt+Shift+Right)"
                    className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
                  >
                    <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-muted)] hover:text-[var(--status-err)] transition-colors cursor-pointer"
                title="Close tab (Alt+W)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {/* New Tab Button */}
        <button
          onClick={onCreateTab}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] border border-transparent hover:border-[var(--border)] transition-colors cursor-pointer shrink-0"
          title="New Tab (Alt+T)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Header Controls (Font Size, Fullscreen, Theme, Shortcuts, User, Logout) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Font size zoom controls */}
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-muted)] overflow-hidden">
          <button
            type="button"
            onClick={onDecreaseFontSize}
            className="px-2 py-1 hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Decrease Font Size (Ctrl + -)"
          >
            A-
          </button>
          <button
            type="button"
            onClick={onResetFontSize}
            className="px-1.5 py-1 text-[11px] font-mono hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Reset Font Size (Ctrl + 0)"
          >
            {fontSize}px
          </button>
          <button
            type="button"
            onClick={onIncreaseFontSize}
            className="px-2 py-1 hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            title="Increase Font Size (Ctrl + +)"
          >
            A+
          </button>
        </div>

        {/* Fullscreen toggle */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] transition-colors cursor-pointer"
          title={isFullscreen ? "Exit Fullscreen (Alt+F)" : "Enter Fullscreen (Alt+F)"}
        >
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
        {isInstallable && onInstallApp && <PwaInstallButton onInstall={onInstallApp} />}
        {/* Self-update pill/badge */}
        {updateAvailable && onOpenUpdateModal && (
          <button
            type="button"
            onClick={onOpenUpdateModal}
            className="px-2 py-1 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs animate-pulse"
            title={`Update available: v${latestVersion || ""}`}
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Update</span>
            {latestVersion && <span className="font-mono text-[11px]">v{latestVersion}</span>}
          </button>
        )}

        <ThemeSelector currentTheme={theme} onSelectTheme={onSelectTheme} />
        {onToggleFileBrowser && (
          <button
            onClick={onToggleFileBrowser}
            className={`p-2 rounded-lg border border-[var(--border)] transition-colors cursor-pointer ${
              isFileBrowserOpen
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)]"
            }`}
            title="Toggle File Browser (Ctrl+E)"
          >
            <Folder className="w-3.5 h-3.5" />
          </button>
        )}
        {onToggleQuickKeys && (
          <button
            type="button"
            onClick={onToggleQuickKeys}
            className={`p-2 rounded-lg border border-[var(--border)] transition-colors cursor-pointer ${
              isQuickKeysOpen
                ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)]"
            }`}
            title="Toggle Quick Keys (Esc, Tab, Ctrl+C, Ctrl+V)"
          >
            <Command className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={() => setShowShortcuts(!showShortcuts)}
          className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] transition-colors cursor-pointer"
          title="Keyboard Shortcuts"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        {username && (
          <span className="hidden md:inline text-xs font-mono text-[var(--fg-muted)] px-1">
            {username}
          </span>
        )}

        <button
          onClick={onLogout}
          className="p-2 rounded-lg text-[var(--fg-muted)] hover:text-[var(--status-err)] hover:bg-[var(--bg-hover)] border border-[var(--border)] transition-colors cursor-pointer"
          title="Log Out"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl text-[var(--fg-base)] animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-[var(--accent)]" />
                Keyboard Shortcuts
              </h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-1 rounded text-[var(--fg-muted)] hover:text-[var(--fg-base)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">New Tab</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + T
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Close Tab</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + W
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Switch to Tab 1–9</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + 1..9
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Next / Previous Tab</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + Left / Right
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Move Tab Left / Right</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + Shift + Left / Right
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Rename Active Tab</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + R
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Toggle Fullscreen</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Alt + F
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Zoom In / Out</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Ctrl + / -
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Reset Zoom</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Ctrl + 0
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-[var(--fg-muted)]">Toggle File Browser</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border)] font-mono text-[11px]">
                  Ctrl + E
                </kbd>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
