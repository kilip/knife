import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "./styles/app.css";

const themeBootstrapScript = `
(function() {
  try {
    var themeId = localStorage.getItem('knife_theme') || 'catppuccin-mocha';
    var themes = {
      'catppuccin-mocha': {
        '--bg-base': '#1e1e2e', '--bg-surface': '#181825', '--bg-elevated': '#313244',
        '--bg-hover': '#45475a', '--bg-active': '#1e1e2e', '--border': '#313244',
        '--fg-base': '#cdd6f4', '--fg-muted': '#a6adc8', '--accent': '#cba6f7',
        '--accent-hover': '#b48ead', '--status-ok': '#a6e3a1', '--status-warn': '#f9e2af', '--status-err': '#f38ba8'
      },
      'tokyo-night': {
        '--bg-base': '#1a1b26', '--bg-surface': '#16161e', '--bg-elevated': '#24283b',
        '--bg-hover': '#2f3549', '--bg-active': '#1a1b26', '--border': '#292e42',
        '--fg-base': '#c0caf5', '--fg-muted': '#7982a9', '--accent': '#7aa2f7',
        '--accent-hover': '#89b4fa', '--status-ok': '#9ece6a', '--status-warn': '#e0af68', '--status-err': '#f7768e'
      },
      'nord': {
        '--bg-base': '#2e3440', '--bg-surface': '#242933', '--bg-elevated': '#3b4252',
        '--bg-hover': '#434c5e', '--bg-active': '#2e3440', '--border': '#434c5e',
        '--fg-base': '#d8dee9', '--fg-muted': '#9aa5b8', '--accent': '#88c0d0',
        '--accent-hover': '#81a1c1', '--status-ok': '#a3be8c', '--status-warn': '#ebcb8b', '--status-err': '#bf616a'
      },
      'gruvbox-dark': {
        '--bg-base': '#282828', '--bg-surface': '#1d2021', '--bg-elevated': '#3c3836',
        '--bg-hover': '#504945', '--bg-active': '#282828', '--border': '#504945',
        '--fg-base': '#ebdbb2', '--fg-muted': '#a89984', '--accent': '#fe8019',
        '--accent-hover': '#fabd2f', '--status-ok': '#b8bb26', '--status-warn': '#fabd2f', '--status-err': '#fb4934'
      },
      'dracula': {
        '--bg-base': '#282a36', '--bg-surface': '#21222c', '--bg-elevated': '#343746',
        '--bg-hover': '#44475a', '--bg-active': '#282a36', '--border': '#44475a',
        '--fg-base': '#f8f8f2', '--fg-muted': '#a4a7b7', '--accent': '#bd93f9',
        '--accent-hover': '#ff79c6', '--status-ok': '#50fa7b', '--status-warn': '#f1fa8c', '--status-err': '#ff5555'
      }
    };
    var selected = themes[themeId] || themes['catppuccin-mocha'];
    var root = document.documentElement;
    for (var key in selected) {
      root.style.setProperty(key, selected[key]);
    }
    var metaTheme = document.getElementById('knife-theme-color-meta');
    if (metaTheme && selected['--bg-base']) metaTheme.setAttribute('content', selected['--bg-base']);
  } catch (e) {}
})();
`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>knife</title>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" id="knife-theme-color-meta" content="#1e1e2e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="knife" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <Meta />
        <Links />
      </head>
      <body className="bg-[var(--bg-base)] text-[var(--fg-base)] h-screen w-screen overflow-hidden select-none font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
