import { useEffect } from "react";

interface UseKeyboardShortcutsOptions {
  activeTabId: string;
  onCreateTab: () => void;
  onRequestCloseTab: (id: string) => void;
  onSelectTabByIndex: (index: number) => void;
  onCycleTab: (direction: "prev" | "next") => void;
  onMoveTab: (direction: "left" | "right") => void;
  onToggleFullscreen: () => void;
  onToggleFileBrowser: () => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onResetFontSize: () => void;
  onOpenSettings: () => void;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  const {
    activeTabId,
    onCreateTab,
    onRequestCloseTab,
    onSelectTabByIndex,
    onCycleTab,
    onMoveTab,
    onToggleFullscreen,
    onToggleFileBrowser,
    onIncreaseFontSize,
    onDecreaseFontSize,
    onResetFontSize,
    onOpenSettings,
  } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a form input/textarea (exempt xterm hidden helper textarea)
      const activeEl = document.activeElement;
      const isXtermHelper = activeEl?.classList.contains("xterm-helper-textarea");
      if ((activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA") && !isXtermHelper) {
        return;
      }

      if (e.altKey && !e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        onToggleFullscreen();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        onToggleFileBrowser();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        onIncreaseFontSize();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        onDecreaseFontSize();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        onResetFontSize();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        onOpenSettings();
        return;
      }

      if (e.altKey && !e.shiftKey && (e.key === "t" || e.key === "T")) {
        e.preventDefault();
        onCreateTab();
        return;
      }

      if (e.altKey && !e.shiftKey && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        if (activeTabId) {
          onRequestCloseTab(activeTabId);
        }
        return;
      }

      if (e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        onSelectTabByIndex(parseInt(e.key, 10) - 1);
        return;
      }

      if (e.altKey && !e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        onCycleTab(e.key === "ArrowLeft" ? "prev" : "next");
        return;
      }

      if (e.altKey && e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        onMoveTab(e.key === "ArrowLeft" ? "left" : "right");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeTabId,
    onCreateTab,
    onRequestCloseTab,
    onSelectTabByIndex,
    onCycleTab,
    onMoveTab,
    onToggleFullscreen,
    onToggleFileBrowser,
    onIncreaseFontSize,
    onDecreaseFontSize,
    onResetFontSize,
    onOpenSettings,
  ]);
}
