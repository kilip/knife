import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { type RefObject, useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import type { KnifeTheme } from "~/features/theme/themes";

export interface XtermOptions {
  theme: KnifeTheme;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  scrollback?: number;
  copyOnSelect?: boolean;
  bellStyle?: "none" | "visual" | "sound";
}

interface UseXtermOptions extends XtermOptions {
  tabId: string;
  isActive: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onRefresh: () => void;
}

const writeClipboard = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

/** Returns false when the key should bypass xterm so app-level shortcuts work. */
function handleAppKey(e: KeyboardEvent, term: Terminal): boolean {
  if (
    e.altKey &&
    (/^[tTwWfF1-9]$/.test(e.key) || e.key === "ArrowLeft" || e.key === "ArrowRight")
  ) {
    return false;
  }
  if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "0", "e", "E", ","].includes(e.key)) {
    return false;
  }
  // Smart Ctrl+C: copy instead of SIGINT when text is selected
  if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C") && e.type === "keydown") {
    if (term.hasSelection()) {
      const selectedText = term.getSelection();
      if (selectedText) writeClipboard(selectedText);
      return false;
    }
  }
  return true;
}

/** Touch-drag scrolling fallback for xterm.js 6.0.0. Returns a disposer. */
function attachTouchScroll(el: HTMLElement, term: Terminal): () => void {
  let touchActive = false;
  let isTouchScrolling = false;
  let touchStartY = 0;
  let touchLastY = 0;
  let touchAccumulatedY = 0;

  const reset = () => {
    touchActive = false;
    isTouchScrolling = false;
  };

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return reset();
    if ((e.target as HTMLElement | null)?.closest(".scrollbar")) {
      touchActive = false;
      return;
    }
    touchActive = true;
    isTouchScrolling = false;
    touchStartY = e.touches[0].clientY;
    touchLastY = touchStartY;
    touchAccumulatedY = 0;
  };

  const onMove = (e: TouchEvent) => {
    if (!touchActive || e.touches.length !== 1) return reset();
    const currentY = e.touches[0].clientY;
    if (!isTouchScrolling) {
      if (Math.abs(currentY - touchStartY) < 6) return;
      isTouchScrolling = true;
    }
    const deltaY = touchLastY - currentY;
    touchLastY = currentY;
    const pxPerLine = (term.options.fontSize ?? 15) * (term.options.lineHeight ?? 1.2) || 18;
    touchAccumulatedY += deltaY;
    const lines = Math.trunc(touchAccumulatedY / pxPerLine);
    if (lines !== 0) {
      term.scrollLines(lines);
      touchAccumulatedY -= lines * pxPerLine;
    }
    if (e.cancelable) e.preventDefault();
  };

  const onEnd = () => {
    reset();
    touchAccumulatedY = 0;
  };

  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchmove", onMove, { passive: false });
  el.addEventListener("touchend", onEnd, { passive: true });
  el.addEventListener("touchcancel", onEnd, { passive: true });
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchmove", onMove);
    el.removeEventListener("touchend", onEnd);
    el.removeEventListener("touchcancel", onEnd);
  };
}

export function useXterm({
  tabId,
  isActive,
  containerRef,
  onData,
  onResize,
  onRefresh,
  theme,
  fontSize,
  fontFamily,
  lineHeight,
  cursorStyle,
  cursorBlink,
  scrollback,
  copyOnSelect,
  bellStyle,
}: UseXtermOptions) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isActiveRef = useRef(isActive);
  const callbacksRef = useRef({ onData, onResize, onRefresh });
  useEffect(() => {
    isActiveRef.current = isActive;
    callbacksRef.current = { onData, onResize, onRefresh };
  }, [isActive, onData, onResize, onRefresh]);

  // Fit and report dimensions to the backend.
  const fitAndResize = () => {
    const term = termRef.current;
    fitAddonRef.current?.fit();
    if (term?.cols && term.rows) callbacksRef.current.onResize(term.cols, term.rows);
  };

  // Sync option changes to the xterm.js instance
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitAndResize only reads stable refs
  useEffect(() => {
    const term = termRef.current;
    if (term && fontSize && term.options.fontSize !== fontSize) {
      term.options.fontSize = fontSize;
      try {
        fitAndResize();
      } catch {}
    }
  }, [fontSize]);

  useEffect(() => {
    const term = termRef.current;
    if (term && fontFamily && term.options.fontFamily !== fontFamily) {
      term.options.fontFamily = fontFamily;
      try {
        fitAddonRef.current?.fit();
      } catch {}
    }
  }, [fontFamily]);

  useEffect(() => {
    const term = termRef.current;
    if (term && lineHeight && term.options.lineHeight !== lineHeight) {
      term.options.lineHeight = lineHeight;
      try {
        fitAddonRef.current?.fit();
      } catch {}
    }
  }, [lineHeight]);

  useEffect(() => {
    if (termRef.current && cursorStyle) termRef.current.options.cursorStyle = cursorStyle;
  }, [cursorStyle]);

  useEffect(() => {
    if (termRef.current && cursorBlink !== undefined) {
      termRef.current.options.cursorBlink = cursorBlink;
    }
  }, [cursorBlink]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme.terminal;
  }, [theme]);

  // When tab becomes active, trigger fit, focus, and refresh
  useEffect(() => {
    if (!isActive || !termRef.current || !fitAddonRef.current) return;
    const timer = setTimeout(() => {
      try {
        fitAddonRef.current?.fit();
        termRef.current?.focus();
        const cols = termRef.current?.cols;
        const rows = termRef.current?.rows;
        if (cols && rows) {
          callbacksRef.current.onResize(cols, rows);
          callbacksRef.current.onRefresh();
        }
      } catch {}
    }, 50);

    const restoreFocus = () => {
      const activeEl = document.activeElement;
      const isFormInput =
        (activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA") &&
        !activeEl.classList.contains("xterm-helper-textarea");
      if (!isFormInput) {
        termRef.current?.focus();
      }
    };

    const refreshTerminal = () => {
      try {
        fitAddonRef.current?.fit();
        const term = termRef.current;
        if (term) {
          term.refresh(0, term.rows - 1);
          if (term.cols && term.rows) {
            callbacksRef.current.onResize(term.cols, term.rows);
          }
        }
      } catch {}
    };

    const handleResume = () => {
      restoreFocus();
      refreshTerminal();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") handleResume();
    };

    window.addEventListener("focus", restoreFocus);
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", restoreFocus);
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialize terminal once per tabId
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isDisposed = false;
    let resizeDebounceTimer: number | NodeJS.Timeout | undefined;

    const term = new Terminal({
      cursorBlink: cursorBlink ?? true,
      cursorStyle: cursorStyle ?? "block",
      fontSize: fontSize ?? 15,
      fontFamily: fontFamily ?? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: lineHeight ?? 1.2,
      theme: theme.terminal,
      allowProposedApi: true,
      scrollback: scrollback ?? 50000,
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = "11";

    term.open(container);

    const loadCanvasFallback = () => {
      if (isDisposed) return;
      try {
        term.loadAddon(new CanvasAddon());
      } catch {
        // Fallback to default DOM renderer
      }
    };

    // Renderer with fallback: WebGL -> Canvas -> DOM
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        loadCanvasFallback();
        if (!isDisposed) {
          try {
            term.refresh(0, term.rows - 1);
          } catch {}
        }
      });
      term.loadAddon(webglAddon);
    } catch {
      loadCanvasFallback();
    }

    // OSC 52 clipboard handler (Pc;Pd where Pd is base64 clipboard content)
    term.parser.registerOscHandler(52, (data) => {
      const parts = data.split(";");
      if (parts.length >= 2) {
        try {
          writeClipboard(atob(parts.slice(1).join(";")));
        } catch {}
      }
      return true;
    });

    if (copyOnSelect) {
      term.onSelectionChange(() => {
        if (term.hasSelection()) {
          const selectedText = term.getSelection();
          if (selectedText) writeClipboard(selectedText);
        }
      });
    }

    if (bellStyle === "visual") {
      term.onBell(() => {
        container.classList.add("opacity-60");
        setTimeout(() => container.classList.remove("opacity-60"), 100);
      });
    }

    term.attachCustomKeyEventHandler((e) => handleAppKey(e, term));

    const onDataDisposable = term.onData((data) => callbacksRef.current.onData(data));

    // Debounced container ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) return;
      clearTimeout(resizeDebounceTimer);
      resizeDebounceTimer = setTimeout(() => {
        try {
          fitAndResize();
        } catch {}
      }, 80);
    });
    resizeObserver.observe(container);

    const detachTouchScroll = attachTouchScroll(container, term);

    // Initial fit
    const initialFitTimer = setTimeout(() => {
      try {
        fitAddon.fit();
        term.focus();
        callbacksRef.current.onResize(term.cols, term.rows);
      } catch {}
    }, 100);

    return () => {
      isDisposed = true;
      clearTimeout(resizeDebounceTimer);
      clearTimeout(initialFitTimer);
      detachTouchScroll();
      resizeObserver.disconnect();
      onDataDisposable.dispose();
      try {
        term.dispose();
      } catch {}
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [tabId]);

  return { termRef, fitAddonRef };
}
