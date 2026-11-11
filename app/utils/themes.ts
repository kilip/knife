import type { ITheme } from "@xterm/xterm";

export interface ThemeColors {
  bgBase: string;
  bgSurface: string;
  bgElevated: string;
  bgHover: string;
  bgActive: string;
  border: string;
  fgBase: string;
  fgMuted: string;
  accent: string;
  accentHover: string;
  statusOk: string;
  statusWarn: string;
  statusErr: string;
}

export interface KnifeTheme {
  id: string;
  name: string;
  terminal: ITheme;
  ui: ThemeColors;
}

export const THEMES: KnifeTheme[] = [
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    ui: {
      bgBase: "#1e1e2e",
      bgSurface: "#181825",
      bgElevated: "#313244",
      bgHover: "#45475a",
      bgActive: "#1e1e2e",
      border: "#313244",
      fgBase: "#cdd6f4",
      fgMuted: "#a6adc8",
      accent: "#cba6f7",
      accentHover: "#b48ead",
      statusOk: "#a6e3a1",
      statusWarn: "#f9e2af",
      statusErr: "#f38ba8",
    },
    terminal: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      cursor: "#f5e0dc",
      cursorAccent: "#1e1e2e",
      selectionBackground: "#585b7080",
      selectionForeground: "#cdd6f4",
      black: "#45475a",
      red: "#f38ba8",
      green: "#a6e3a1",
      yellow: "#f9e2af",
      blue: "#89b4fa",
      magenta: "#f5c2e7",
      cyan: "#94e2d5",
      white: "#bac2de",
      brightBlack: "#585b70",
      brightRed: "#f38ba8",
      brightGreen: "#a6e3a1",
      brightYellow: "#f9e2af",
      brightBlue: "#89b4fa",
      brightMagenta: "#f5c2e7",
      brightCyan: "#94e2d5",
      brightWhite: "#a6adc8",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    ui: {
      bgBase: "#1a1b26",
      bgSurface: "#16161e",
      bgElevated: "#24283b",
      bgHover: "#2f3549",
      bgActive: "#1a1b26",
      border: "#292e42",
      fgBase: "#c0caf5",
      fgMuted: "#7982a9",
      accent: "#7aa2f7",
      accentHover: "#89b4fa",
      statusOk: "#9ece6a",
      statusWarn: "#e0af68",
      statusErr: "#f7768e",
    },
    terminal: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      cursor: "#c0caf5",
      cursorAccent: "#1a1b26",
      selectionBackground: "#364a8280",
      selectionForeground: "#c0caf5",
      black: "#15161e",
      red: "#f7768e",
      green: "#9ece6a",
      yellow: "#e0af68",
      blue: "#7aa2f7",
      magenta: "#bb9af7",
      cyan: "#7dcfff",
      white: "#a9b1d6",
      brightBlack: "#414868",
      brightRed: "#f7768e",
      brightGreen: "#9ece6a",
      brightYellow: "#e0af68",
      brightBlue: "#7aa2f7",
      brightMagenta: "#bb9af7",
      brightCyan: "#7dcfff",
      brightWhite: "#c0caf5",
    },
  },
  {
    id: "nord",
    name: "Nord",
    ui: {
      bgBase: "#2e3440",
      bgSurface: "#242933",
      bgElevated: "#3b4252",
      bgHover: "#434c5e",
      bgActive: "#2e3440",
      border: "#434c5e",
      fgBase: "#d8dee9",
      fgMuted: "#9aa5b8",
      accent: "#88c0d0",
      accentHover: "#81a1c1",
      statusOk: "#a3be8c",
      statusWarn: "#ebcb8b",
      statusErr: "#bf616a",
    },
    terminal: {
      background: "#2e3440",
      foreground: "#d8dee9",
      cursor: "#d8dee9",
      cursorAccent: "#2e3440",
      selectionBackground: "#434c5e80",
      selectionForeground: "#d8dee9",
      black: "#3b4252",
      red: "#bf616a",
      green: "#a3be8c",
      yellow: "#ebcb8b",
      blue: "#81a1c1",
      magenta: "#b48ead",
      cyan: "#88c0d0",
      white: "#e5e9f0",
      brightBlack: "#4c566a",
      brightRed: "#bf616a",
      brightGreen: "#a3be8c",
      brightYellow: "#ebcb8b",
      brightBlue: "#81a1c1",
      brightMagenta: "#b48ead",
      brightCyan: "#8fbcbb",
      brightWhite: "#eceff4",
    },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    ui: {
      bgBase: "#282828",
      bgSurface: "#1d2021",
      bgElevated: "#3c3836",
      bgHover: "#504945",
      bgActive: "#282828",
      border: "#504945",
      fgBase: "#ebdbb2",
      fgMuted: "#a89984",
      accent: "#fe8019",
      accentHover: "#fabd2f",
      statusOk: "#b8bb26",
      statusWarn: "#fabd2f",
      statusErr: "#fb4934",
    },
    terminal: {
      background: "#282828",
      foreground: "#ebdbb2",
      cursor: "#ebdbb2",
      cursorAccent: "#282828",
      selectionBackground: "#50494580",
      selectionForeground: "#ebdbb2",
      black: "#282828",
      red: "#cc241d",
      green: "#98971a",
      yellow: "#d79921",
      blue: "#458588",
      magenta: "#b16286",
      cyan: "#689d6a",
      white: "#a89984",
      brightBlack: "#928374",
      brightRed: "#fb4934",
      brightGreen: "#b8bb26",
      brightYellow: "#fabd2f",
      brightBlue: "#83a598",
      brightMagenta: "#d3869b",
      brightCyan: "#8ec07c",
      brightWhite: "#ebdbb2",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    ui: {
      bgBase: "#282a36",
      bgSurface: "#21222c",
      bgElevated: "#343746",
      bgHover: "#44475a",
      bgActive: "#282a36",
      border: "#44475a",
      fgBase: "#f8f8f2",
      fgMuted: "#a4a7b7",
      accent: "#bd93f9",
      accentHover: "#ff79c6",
      statusOk: "#50fa7b",
      statusWarn: "#f1fa8c",
      statusErr: "#ff5555",
    },
    terminal: {
      background: "#282a36",
      foreground: "#f8f8f2",
      cursor: "#f8f8f2",
      cursorAccent: "#282a36",
      selectionBackground: "#44475a80",
      selectionForeground: "#f8f8f2",
      black: "#21222c",
      red: "#ff5555",
      green: "#50fa7b",
      yellow: "#f1fa8c",
      blue: "#bd93f9",
      magenta: "#ff79c6",
      cyan: "#8be9fd",
      white: "#f8f8f2",
      brightBlack: "#6272a4",
      brightRed: "#ff6e6e",
      brightGreen: "#69ff94",
      brightYellow: "#ffffa5",
      brightBlue: "#d6acff",
      brightMagenta: "#ff92df",
      brightCyan: "#a4ffff",
      brightWhite: "#ffffff",
    },
  },
];

export const THEME_MAP = new Map<string, KnifeTheme>(THEMES.map((theme) => [theme.id, theme]));

export const DEFAULT_THEME_ID = "catppuccin-mocha";

export function getTheme(id?: string): KnifeTheme {
  if (id && THEME_MAP.has(id)) {
    return THEME_MAP.get(id)!;
  }
  return THEME_MAP.get(DEFAULT_THEME_ID)!;
}

export function applyTheme(themeId: string): KnifeTheme {
  const theme = getTheme(themeId);
  const root = document.documentElement;

  root.style.setProperty("--bg-base", theme.ui.bgBase);
  root.style.setProperty("--bg-surface", theme.ui.bgSurface);
  root.style.setProperty("--bg-elevated", theme.ui.bgElevated);
  root.style.setProperty("--bg-hover", theme.ui.bgHover);
  root.style.setProperty("--bg-active", theme.ui.bgActive);
  root.style.setProperty("--border", theme.ui.border);
  root.style.setProperty("--fg-base", theme.ui.fgBase);
  root.style.setProperty("--fg-muted", theme.ui.fgMuted);
  root.style.setProperty("--accent", theme.ui.accent);
  root.style.setProperty("--accent-hover", theme.ui.accentHover);
  root.style.setProperty("--status-ok", theme.ui.statusOk);
  root.style.setProperty("--status-warn", theme.ui.statusWarn);
  root.style.setProperty("--status-err", theme.ui.statusErr);

  if (typeof document !== "undefined") {
    const metaTheme = document.getElementById("knife-theme-color-meta");
    if (metaTheme) {
      metaTheme.setAttribute("content", theme.ui.bgBase);
    }
  }
  try {
    localStorage.setItem("knife_theme", theme.id);
  } catch {}

  return theme;
}

export function getStoredThemeId(): string {
  try {
    const saved = localStorage.getItem("knife_theme");
    if (saved && THEME_MAP.has(saved)) {
      return saved;
    }
  } catch {}
  return DEFAULT_THEME_ID;
}
