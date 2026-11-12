import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowLeft,
  Palette,
  Terminal as TerminalIcon,
  Sliders,
  User,
  Check,
  RotateCcw,
  LogOut,
  Laptop,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { THEMES } from "~/utils/themes";
import { useSettings, FONT_PRESETS } from "~/hooks/useSettings";

type SettingsTab = "appearance" | "terminal" | "behavior" | "system";

interface UserProfile {
  authenticated: boolean;
  username?: string;
  shell?: string;
  shellName?: string;
}

interface SystemInfo {
  version?: string;
  status?: string;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { settings, isSaving, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [customFontInput, setCustomFontInput] = useState("");
  const [isCustomFont, setIsCustomFont] = useState(false);

  // Check if current font matches any preset
  useEffect(() => {
    const isPreset = FONT_PRESETS.some((p) => p.value === settings.fontFamily);
    if (!isPreset) {
      setIsCustomFont(true);
      setCustomFontInput(settings.fontFamily);
    } else {
      setIsCustomFont(false);
    }
  }, [settings.fontFamily]);

  // Fetch user profile and system health
  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setUserProfile(data);
      })
      .catch(() => {});

    fetch("/api/health")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setSystemInfo(data);
      })
      .catch(() => {});
  }, []);

  // Keyboard shortcut: Esc to return to terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showResetConfirm) {
        e.preventDefault();
        navigate("/");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, showResetConfirm]);

  const handleCustomFontSubmit = useCallback(() => {
    const trimmed = customFontInput.trim();
    if (trimmed) {
      updateSettings({ fontFamily: trimmed });
    }
  }, [customFontInput, updateSettings]);

  const handleLogout = () => {
    window.location.href = "/auth/logout";
  };

  const navItems: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "terminal", label: "Terminal", icon: TerminalIcon },
    { id: "behavior", label: "Behavior", icon: Sliders },
    { id: "system", label: "System & Account", icon: User },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--fg-base)] flex flex-col font-sans transition-colors duration-150">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)] border border-[var(--border)] transition-colors cursor-pointer"
            title="Back to Terminal (Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Terminal</span>
            <kbd className="hidden sm:inline-block ml-1 px-1 py-0.2 rounded bg-[var(--bg-elevated)] text-[10px] text-[var(--fg-muted)] font-mono border border-[var(--border)]">
              Esc
            </kbd>
          </Link>
          <div className="h-4 w-px bg-[var(--border)]" />
          <h1 className="text-sm font-semibold flex items-center gap-2">Settings</h1>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center gap-2 text-xs">
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-[var(--accent)] font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[var(--status-ok)] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Saved</span>
            </span>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Sidebar Navigation */}
          <aside className="md:col-span-4 lg:col-span-3 flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none border-b md:border-b-0 md:border-r border-[var(--border)] md:pr-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 cursor-pointer text-left ${
                    isActive
                      ? "bg-[var(--accent)] text-white shadow-xs font-semibold"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </aside>

          {/* Content Panel */}
          <section className="md:col-span-8 lg:col-span-9 flex flex-col gap-6">
            {/* 1. Appearance Section */}
            {activeTab === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold">Appearance</h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                    Customize the interface palette and layout density.
                  </p>
                </div>

                {/* Theme Selector */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                      Theme Palette
                    </h3>
                    <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                      Select your preferred color scheme. Changes apply instantly across all tabs
                      and UI elements.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {THEMES.map((t) => {
                      const isSelected = settings.theme === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => updateSettings({ theme: t.id })}
                          className={`relative flex flex-col p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? "border-[var(--accent)] bg-[var(--bg-elevated)] ring-1 ring-[var(--accent)] shadow-xs"
                              : "border-[var(--border)] bg-[var(--bg-base)] hover:border-[var(--fg-muted)] hover:bg-[var(--bg-elevated)]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold">{t.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                          </div>

                          {/* Color Swatches */}
                          <div className="flex items-center gap-1.5 mt-auto pt-2 border-t border-[var(--border)]/60">
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: t.ui.bgBase }}
                              title={`Background: ${t.ui.bgBase}`}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: t.ui.bgSurface }}
                              title={`Surface: ${t.ui.bgSurface}`}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                              style={{ backgroundColor: t.ui.accent }}
                              title={`Accent: ${t.ui.accent}`}
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                              style={{
                                backgroundColor: String(t.terminal.green || "#a6e3a1"),
                              }}
                              title="Terminal Green"
                            />
                            <span
                              className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                              style={{
                                backgroundColor: String(t.terminal.blue || "#89b4fa"),
                              }}
                              title="Terminal Blue"
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Density Options */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Layout Density
                  </h3>

                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-xs font-medium">Compact Tab Bar</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Reduce tab padding and top bar height to maximize terminal vertical space.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.compactTabs}
                        onChange={(e) => updateSettings({ compactTabs: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--bg-elevated)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]" />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Terminal Section */}
            {activeTab === "terminal" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold">Terminal</h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                    Configure typography, cursor appearance, and scrollback buffer.
                  </p>
                </div>

                {/* Live Preview Card */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)] flex items-center gap-1.5">
                      <Laptop className="w-3.5 h-3.5" />
                      Live Terminal Preview
                    </span>
                    <span className="text-[11px] text-[var(--fg-muted)] font-mono">
                      {settings.fontSize}px • {settings.cursorStyle} cursor
                    </span>
                  </div>

                  {/* Terminal Window Mockup */}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] overflow-hidden shadow-inner">
                    <div className="px-3 py-1.5 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-err)] opacity-80" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-warn)] opacity-80" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[var(--status-ok)] opacity-80" />
                      </div>
                      <span className="text-[10px] text-[var(--fg-muted)] font-mono">
                        knife-term — 80x24
                      </span>
                      <div className="w-8" />
                    </div>

                    <div
                      className="p-4 overflow-x-auto font-mono text-[var(--fg-base)] select-none"
                      style={{
                        fontFamily: settings.fontFamily,
                        fontSize: `${settings.fontSize}px`,
                        lineHeight: settings.lineHeight,
                      }}
                    >
                      <div className="text-[var(--status-ok)]">
                        toni@knife
                        <span className="text-[var(--fg-muted)]">:</span>
                        <span className="text-[var(--accent)]">~</span>
                        <span className="text-[var(--fg-muted)]">$</span> uname -sm
                      </div>
                      <div className="text-[var(--fg-muted)]">Linux 7.3.3-1-cachyos x86_64</div>
                      <div className="mt-1 text-[var(--status-ok)]">
                        toni@knife
                        <span className="text-[var(--fg-muted)]">:</span>
                        <span className="text-[var(--accent)]">~/projects</span>
                        <span className="text-[var(--fg-muted)]">$</span> cargo build --release
                      </div>
                      <div className="text-[var(--status-ok)] flex items-center gap-1">
                        <span>Compiling knife v1.2.0...</span>
                      </div>
                      <div className="mt-1 flex items-center">
                        <span className="text-[var(--status-ok)]">toni@knife</span>
                        <span className="text-[var(--fg-muted)]">:</span>
                        <span className="text-[var(--accent)]">~</span>
                        <span className="text-[var(--fg-muted)] mr-1">$</span>
                        {/* Cursor rendering */}
                        <span
                          className={`inline-block ${
                            settings.cursorStyle === "block"
                              ? "w-2 bg-[var(--accent)] text-[var(--bg-base)] h-[1.1em] align-middle"
                              : settings.cursorStyle === "underline"
                                ? "w-2 border-b-2 border-[var(--accent)] h-[1.1em] align-middle"
                                : "w-[2px] bg-[var(--accent)] h-[1.1em] align-middle"
                          } ${settings.cursorBlink ? "animate-pulse" : ""}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Font Family Selection */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Font Family
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {FONT_PRESETS.map((preset) => {
                      const isSelected = !isCustomFont && settings.fontFamily === preset.value;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setIsCustomFont(false);
                            updateSettings({ fontFamily: preset.value });
                          }}
                          className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? "border-[var(--accent)] bg-[var(--bg-elevated)] text-[var(--fg-base)] font-semibold"
                              : "border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-elevated)]"
                          }`}
                        >
                          <span className="text-xs">{preset.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setIsCustomFont(true)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between ${
                        isCustomFont
                          ? "border-[var(--accent)] bg-[var(--bg-elevated)] text-[var(--fg-base)] font-semibold"
                          : "border-[var(--border)] bg-[var(--bg-base)] text-[var(--fg-muted)] hover:text-[var(--fg-base)] hover:bg-[var(--bg-elevated)]"
                      }`}
                    >
                      <span className="text-xs">Custom Font...</span>
                      {isCustomFont && <Check className="w-3.5 h-3.5 text-[var(--accent)]" />}
                    </button>
                  </div>

                  {/* Custom Font Input */}
                  {isCustomFont && (
                    <div className="pt-2 flex gap-2">
                      <input
                        type="text"
                        value={customFontInput}
                        onChange={(e) => setCustomFontInput(e.target.value)}
                        onBlur={handleCustomFontSubmit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCustomFontSubmit();
                        }}
                        placeholder="e.g. 'Comic Code', 'Courier New', monospace"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs text-[var(--fg-base)] focus:outline-hidden focus:border-[var(--accent)]"
                      />
                      <button
                        type="button"
                        onClick={handleCustomFontSubmit}
                        className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium cursor-pointer hover:opacity-90"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>

                {/* Font Size & Line Height */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Dimensions & Spacing
                  </h3>

                  {/* Font Size Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <label htmlFor="fontSizeRange" className="font-medium text-[var(--fg-base)]">
                        Font Size
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border)]">
                          {settings.fontSize}px
                        </span>
                        {settings.fontSize !== 15 && (
                          <button
                            type="button"
                            onClick={() => updateSettings({ fontSize: 15 })}
                            className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      id="fontSizeRange"
                      type="range"
                      min={10}
                      max={32}
                      step={1}
                      value={settings.fontSize}
                      onChange={(e) =>
                        updateSettings({
                          fontSize: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--fg-muted)] font-mono">
                      <span>10px</span>
                      <span>15px (default)</span>
                      <span>32px</span>
                    </div>
                  </div>

                  {/* Line Height Slider */}
                  <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                    <div className="flex justify-between items-center text-xs">
                      <label
                        htmlFor="lineHeightRange"
                        className="font-medium text-[var(--fg-base)]"
                      >
                        Line Height
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border)]">
                          {settings.lineHeight}
                        </span>
                        {settings.lineHeight !== 1.2 && (
                          <button
                            type="button"
                            onClick={() => updateSettings({ lineHeight: 1.2 })}
                            className="text-[10px] text-[var(--accent)] hover:underline cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      id="lineHeightRange"
                      type="range"
                      min={1.0}
                      max={2.0}
                      step={0.05}
                      value={settings.lineHeight}
                      onChange={(e) =>
                        updateSettings({
                          lineHeight: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-[var(--accent)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--fg-muted)] font-mono">
                      <span>1.0</span>
                      <span>1.2 (default)</span>
                      <span>2.0</span>
                    </div>
                  </div>
                </div>

                {/* Cursor & Scrollback */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Cursor & Buffer
                  </h3>

                  {/* Cursor Style */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-xs font-medium">Cursor Style</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Caret shape displayed inside active terminal sessions.
                      </div>
                    </div>
                    <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-0.5 text-xs">
                      {(["block", "underline", "bar"] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => updateSettings({ cursorStyle: style })}
                          className={`px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer text-xs ${
                            settings.cursorStyle === style
                              ? "bg-[var(--accent)] text-white font-medium"
                              : "text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cursor Blink */}
                  <div className="flex items-center justify-between py-1 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xs font-medium">Cursor Blinking</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Enable animated cursor blink when terminal is focused.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.cursorBlink}
                        onChange={(e) => updateSettings({ cursorBlink: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--bg-elevated)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]" />
                    </label>
                  </div>

                  {/* Scrollback buffer */}
                  <div className="flex items-center justify-between py-1 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xs font-medium">Scrollback Lines</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Maximum history rows retained per tab (1,000–50,000).
                      </div>
                    </div>
                    <input
                      type="number"
                      min={1000}
                      max={50000}
                      step={1000}
                      value={settings.scrollback}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!Number.isNaN(val)) {
                          updateSettings({
                            scrollback: Math.max(1000, Math.min(50000, val)),
                          });
                        }
                      }}
                      className="w-24 px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-xs font-mono text-right text-[var(--fg-base)] focus:outline-hidden focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. Behavior Section */}
            {activeTab === "behavior" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold">Behavior</h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                    Terminal interaction, bell alerts, and workflow preferences.
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Interaction
                  </h3>

                  {/* Copy on select */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-xs font-medium">Copy on Select</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Automatically copy selected terminal text to system clipboard.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.copyOnSelect}
                        onChange={(e) => updateSettings({ copyOnSelect: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--bg-elevated)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]" />
                    </label>
                  </div>

                  {/* Bell Style */}
                  <div className="flex items-center justify-between py-1 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xs font-medium">Terminal Bell</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Feedback trigger when terminal emits BEL (\x07).
                      </div>
                    </div>
                    <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-0.5 text-xs">
                      {(["none", "visual", "sound"] as const).map((style) => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => updateSettings({ bellStyle: style })}
                          className={`px-2.5 py-1 rounded-md capitalize transition-colors cursor-pointer text-xs ${
                            settings.bellStyle === style
                              ? "bg-[var(--accent)] text-white font-medium"
                              : "text-[var(--fg-muted)] hover:text-[var(--fg-base)]"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Default Quick Keys Bar */}
                  <div className="flex items-center justify-between py-1 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xs font-medium">Quick Keys Toolbar Default</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Always display touch action toolbar (Esc, Tab, Ctrl+C) on desktop startup.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.defaultQuickKeys}
                        onChange={(e) => updateSettings({ defaultQuickKeys: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--bg-elevated)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]" />
                    </label>
                  </div>

                  {/* Confirm Close Tab */}
                  <div className="flex items-center justify-between py-1 border-t border-[var(--border)] pt-3">
                    <div>
                      <div className="text-xs font-medium">Confirm Tab Closure</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Prompt confirmation dialog before terminating active shell session.
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.confirmCloseTab}
                        onChange={(e) => updateSettings({ confirmCloseTab: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-[var(--bg-elevated)] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[var(--border)] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--accent)] border border-[var(--border)]" />
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* 4. System & Account Section */}
            {activeTab === "system" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-base font-semibold">System & Account</h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                    Host session status, daemon info, and configuration resets.
                  </p>
                </div>

                {/* Profile Card */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Current Session
                  </h3>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 flex items-center justify-center text-[var(--accent)] font-semibold text-sm">
                        {userProfile?.username?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div>
                        <div className="text-xs font-semibold">
                          {userProfile?.username || "Authenticated User"}
                        </div>
                        <div className="text-[11px] text-[var(--fg-muted)] font-mono">
                          {userProfile?.shell || "/bin/bash"} ({userProfile?.shellName || "Shell"})
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--fg-muted)] hover:text-[var(--status-err)] hover:border-[var(--status-err)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out</span>
                    </button>
                  </div>
                </div>

                {/* Server Info Card */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
                    Host Daemon
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border)]">
                      <span className="text-[var(--fg-muted)] block text-[11px]">
                        Knife Version
                      </span>
                      <span className="font-mono font-medium">
                        v{systemInfo?.version || "1.0.0"}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border)]">
                      <span className="text-[var(--fg-muted)] block text-[11px]">
                        Runtime Daemon
                      </span>
                      <span className="font-mono font-medium text-[var(--status-ok)]">
                        ● Healthy
                      </span>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="rounded-xl border border-[var(--status-err)]/30 bg-[var(--bg-surface)] p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--status-err)]">
                      Danger Zone
                    </h3>
                    <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                      Reset your preferences to factory defaults.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <div className="text-xs font-medium">Reset All Settings</div>
                      <div className="text-[11px] text-[var(--fg-muted)]">
                        Restores appearance, terminal dimensions, and shortcuts to default values.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--status-err)]/50 text-[var(--status-err)] hover:bg-[var(--status-err)] hover:text-white transition-colors text-xs font-medium cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset to Defaults</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-2xl text-[var(--fg-base)] space-y-4">
            <div className="flex items-center gap-3 text-[var(--status-warn)]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">Reset All Settings?</h3>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              This action will revert theme, font, cursor, and behavior configurations to default
              values.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--fg-muted)] hover:text-[var(--fg-base)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resetSettings();
                  setShowResetConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-[var(--status-err)] text-white text-xs font-medium cursor-pointer hover:opacity-90"
              >
                Reset Defaults
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
