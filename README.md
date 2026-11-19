# knife 🔪

A single-user self-hosted web terminal with multi-tab support, PWA, and integrated file browser. Powered by Bun's native PTY engine and designed to be served behind a reverse proxy (e.g. Caddy) on a user-configured public domain.

---

## ✨ Features

- **Native Bun PTY**: Uses Bun's native `Bun.Terminal` PTY engine spawning your login shell (`$SHELL -l`) directly — no native C++ addons or `node-pty` required.
- **Resilient WebSockets**: Disconnecting or refreshing the page keeps the PTY alive for a 60-second grace period and replays a server-side screen snapshot (plus bounded scrollback) on reconnect. Auto-reconnect with exponential backoff and application-level ping/pong heartbeats.
- **React Router 8 + Tailwind CSS**: Clean single-page application built on React Router 8 (framework mode, `ssr: false`) with CSS-variable-driven theming.
- **Full xterm.js feature set**: Fit, WebLinks, WebGL with Canvas/DOM fallbacks, Unicode 11, OSC 52 clipboard sync, truecolor (24-bit), and mouse reporting.
- **5 Built-in Themes**: Catppuccin Mocha (default), Tokyo Night, Nord, Gruvbox Dark, and Dracula. One unified definition powers both Tailwind UI tokens and the 16-color terminal palette, with zero flash on initial load.
- **Single-User Security**: GitHub OAuth 2.0 restricted to a single configured username, automatically pinned to the account's numeric GitHub user ID (`allowedUserId`) on first login. First-run wizard protected by a one-time console setup token.
- **Progressive Web App (PWA)**: Serwist-powered service worker with precached application shell, standalone installability, offline banner, safe-area insets, and dynamic theme-color meta synchronization.
- **Integrated File Browser & Transfers**: Left-docked split pane on desktop and slide-over drawer on mobile. Breadcrumbs navigation, sortable flat list, hidden files toggle, inline previews for text & images (<2MB), two-way drag-and-drop (drop desktop files onto the terminal canvas to upload to active tab CWD; drag browser files to paste shell-escaped paths), live CWD synchronization, on-the-fly streaming `.zip` downloads with zero disk staging, and floating transfer queue drawer with speed and progress indicators.
- **Quick Keys & Settings**: Toggleable touch/quick-keys bar (`Esc`, `Tab`, `Ctrl+C`, `Ctrl+V`, arrow keys), customizable terminal font/cursor/scrollback settings, and built-in self-update from the Settings page.

---

## 🏗️ Architecture Overview

```
Browser Client (React Router 8, xterm.js)
       │
       ▼ (HTTPS / WSS)
Reverse Proxy (Caddy / Nginx, terminates TLS)
       │
       ▼ (HTTP / WS on loopback, e.g. 127.0.0.1:3000)
Knife Bun HTTP & WebSocket Server
       │
       └─► In-memory PTY Registry (tabId -> PtySession via Bun.Terminal)
                 ├── knife-<id-1> ($SHELL -l, headless screen snapshot)
                 ├── knife-<id-2> ($SHELL -l, headless screen snapshot)
                 └── knife-<id-3> ($SHELL -l, headless screen snapshot)
```

- **Tab Persistence**: Tab metadata (`id`, `name`, `order`, `createdAt`) is persisted in `<dataDir>/tabs.json`.
- **WebSocket Reconnect**: When a client disconnects or refreshes, Knife keeps the in-memory `PtySession` alive for a 60-second grace period. Reconnecting within that window cancels the timer and replays a serialized server-side screen snapshot (active screen, modes, and up to 1,000 lines of scrollback).
- **Explicit Close & Restart**: Closing a tab immediately terminates its `PtySession` and removes it from `tabs.json`. Restarting the Knife server or applying a self-update terminates all running shells.

---

## 📋 Prerequisites

- **Supported platforms**: **Linux** (`x86_64` or `aarch64`, primary target), **macOS** (best-effort; live CWD tracking via `/proc` is Linux-only). **Windows** is unsupported.
- **Bun** (v1.2+)

---

## 🚀 Quick Start

### Option A: Run via Bun or NPX (Recommended)

No cloning or manual building required:

```bash
# Run directly with bunx
bunx @kilip/knife

# Or run with npx (requires bun installed on system)
npx @kilip/knife

# Or install globally
bun add -g @kilip/knife
knife
```

### Option B: Build from Source

```bash
git clone https://github.com/kilip/knife.git
cd knife
bun install
bun run build
bun start
```

Knife defaults to listening on `127.0.0.1:3000`.

### 3. First-Run Setup Wizard

On initial startup (or by running `knife onboarding`), knife generates a cryptographically secure one-time setup token and prints a clickable setup URL to your local console:

```
================================================================
  KNIFE - First Run Setup
================================================================

No existing configuration found. Knife is running in setup mode.
Open the following ready-to-click URL in your browser to configure knife:

  http://127.0.0.1:3000/setup?token=0123456789abcdef...

One-time Setup Token: 0123456789abcdef...
================================================================
```

For security, unauthenticated HTTP requests in first-run mode redirect to `/setup` without `?token=`. Retrieve the setup URL and token locally from your terminal or via `knife onboarding`.

Click the link (or navigate to `/setup?token=<token>`) to configure:

1. **Public Domain**: e.g. `knife.example.com`
2. **GitHub OAuth**:
   - Create a GitHub OAuth App at [GitHub Developer Settings](https://github.com/settings/developers).
   - Set **Authorization callback URL** to the exact URL shown on the setup screen:
     `https://<your-public-domain>/auth/github/callback`
   - Paste the **Client ID** and **Client Secret**.
3. **Allowed Username**: Your GitHub handle (only this user can log in).
4. **Theme**: Select your preferred starting theme.

Once saved, the setup token is permanently invalidated and knife switches to standard authenticated mode.

---

## ⚙️ Background Service (`knife service`)

Knife includes built-in background service management to run reliably across server reboots, user logouts, and crashes:

```bash
# Install as a background service (automatically reuses existing config.json)
knife service install

# Start the service
knife service start

# Check status, PID, listening endpoint, and recent logs
knife service status

# Restart or stop
knife service restart
knife service stop

# Uninstall the service
knife service uninstall
```

Both space-separated (`knife service <cmd>`) and colon-separated (`knife service:<cmd>`) syntax are supported.

### Service Commands & Options

- **`knife service install`**: Registers an OS service unit:
  - **Linux (`systemd`)**: Installs a user unit at `~/.config/systemd/user/knife.service`. Verifies and enables user lingering (`loginctl enable-linger $USER`) so Knife persists after logout and boots with the system.
  - **macOS (`launchd`)**: Installs a user agent at `~/Library/LaunchAgents/com.kilip.knife.plist`.
  - `--config <path>`: Explicit path to `config.json` (auto-detects existing config by default).
  - `--dir <path>`: Working directory for state and storage.
  - `-p, --port <port>`: Explicit port override.
  - `--host <ip>`: Explicit host override.
  - `-d, --domain <domain>`: Explicit public domain override.
  - `--env <K=V>`: Extra environment variable to inject (can be repeated).
  - `--name <str>`: Custom service name (default: `knife`).
  - `--user`: Install as user-level service/agent (default).
  - `--system`: Install as a system-wide daemon (requires `sudo` / Administrator; runs as `root` without a `User=` drop — prefer `--user` unless system-wide execution is required).
- **`knife service start`**: Starts the registered background service.
- **`knife service stop`**: Stops the running service.
- **`knife service restart`**: Restarts the service.
- **`knife service status`**: Displays current status (running/stopped/failed), PID, listening endpoint, active setup link (if first-run setup is pending), and recent logs.
- **`knife service uninstall`**: Stops, unregisters, and removes the service unit without deleting your `config.json` or tab data.

---

## 🩺 Diagnostics (`knife doctor`)

Run read-only environment, configuration, security, and background service checks:

```bash
knife doctor
```

Checks include OS/platform support, Bun runtime (`>= 1.2.0`), client production build (`build/client`), login shell executability, native `Bun.Terminal` PTY allocation, `config.json` validity and file permissions (`0600`), auth/proxy hygiene, data directory writability and state files (`tabs.json`, `settings.json`), background service unit health and Linux user lingering, local `/health` endpoint probe, and npm registry version check.

Exits with `0` when no checks fail (`pass`/`warn`/`info`), and `1` if any check fails. Secret fields (`githubClientSecret`, `sessionSecret`) are never printed.

### Doctor Options

- `--config <path>`: Path to `config.json` to inspect
- `--host <ip>` / `-p, --port <port>`: Override listen host/port for local `/health` check
- `--name <str>`: Background service name to inspect (default: `knife`)
- `--user` / `--system`: Inspect user-level or system-wide background service
- `--offline`: Skip the npm registry update check
- `--json`: Emit a machine-readable JSON report

---

## 🔄 CLI Self-Update (`knife self-update`)

Check for updates or upgrade `@kilip/knife` directly from the terminal:

```bash
# Check whether a newer version is available
knife self-update --check

# Upgrade to latest and automatically restart an active background service
knife self-update
```

When an active background service is detected, `knife self-update` automatically restarts it after installing the update (unless `--no-restart` is passed). When running from a local git source checkout, it refuses to overwrite unless `--force` is specified.

### Self-Update Options

- `--check`: Query the npm registry without installing
- `--version <ver>`: Install a specific version or dist-tag (default: `latest`)
- `--pm <bun|npm>`: Override package manager (`bun` or `npm`, auto-detected by default)
- `-f, --force`: Reinstall even if already up to date or running from a source checkout
- `--no-restart`: Do not automatically restart an active background service
- `--name <str>`: Background service name to inspect/restart (default: `knife`)
- `--user` / `--system`: Target user-level or system-wide background service

---

## 🌐 Reverse Proxy Setup (Caddy)

Knife listens on plain HTTP behind a reverse proxy that terminates TLS. The public domain configured during setup governs the allowed WebSocket origins, CSP, and secure cookie attributes.

Here is a recommended `Caddyfile`:

```caddy
knife.example.com {
    # Automatic Let's Encrypt TLS
    tls your-email@example.com

    # Reverse proxy HTTP and WebSockets to Knife
    reverse_proxy 127.0.0.1:3000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

_Note:_ Knife trusts `X-Forwarded-*` headers only from configured proxy addresses (by default: loopback `127.0.0.1`, `::1`, and private subnets).

---

## 🔒 Security Model & Assumptions

- **`--system` root execution:** Running `knife service install --system` registers a system-wide daemon that executes as `root` without a `User=` drop. Prefer the default `--user` mode unless a system-wide service is explicitly required.
- **`isProtectedPath` scope (safety guardrail, not a security boundary):** `isProtectedPath` guards file-browser write, delete, and rename operations against accidental modification of system paths, the Knife installation root, `data/`, and `config.json`. It is a safety guardrail rather than a security boundary, since authenticated users already have interactive shell access.
- **Self-update trust assumptions:** Built-in self-update runs `bun add -g @kilip/knife@latest` (or `npm install -g @kilip/knife@latest`) without version pinning or provenance verification, trusting the npm registry and published package integrity.

---

## 🛠️ Configuration Reference

Configuration precedence:

```
CLI Flags > Environment Variables > config.json > Defaults
```

### CLI Commands & Flags

- `knife onboarding`: Start or attach to first-run setup mode and print the one-time setup URL and token to local stdout
- `knife service <action>`: Manage background service (`install`, `uninstall`, `start`, `stop`, `status`, `restart`)
- `knife doctor`: Run read-only diagnostics across runtime, build, shell/PTY, config, data dir, service, and server health (`--offline`, `--json`)
- `knife self-update`: Check for or install `@kilip/knife` updates via `bun`/`npm` and restart an active background service (`--check`, `--version`, `--pm`, `--force`, `--no-restart`)
- `--host <ip>`: Listen host (default: `127.0.0.1`)
- `-p, --port <number>`: Listen port (default: `3000`)
- `-d, --domain <domain>`: Public domain (default: `""` or `KNIFE_PUBLIC_DOMAIN`)
- `--config <path>`: Path to `config.json` (default: `./config.json` or `KNIFE_CONFIG_PATH`)
- `-h, --help`: Display help

### Environment Variables

- `KNIFE_HOST`: Listen host address
- `KNIFE_PORT`: Listen port number
- `KNIFE_PUBLIC_DOMAIN`: Public domain (e.g. `knife.itstoni.com`)
- `KNIFE_CONFIG_PATH`: Path to configuration file
- `KNIFE_DATA_DIR`: Directory for persistent `tabs.json` and `settings.json`
- `KNIFE_SESSION_SECRET`: Secret key used for signing session cookies

### `config.json` Example

```json
{
  "host": "127.0.0.1",
  "port": 3000,
  "publicDomain": "knife.example.com",
  "publicScheme": "https",
  "trustedProxies": ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  "theme": "catppuccin-mocha",
  "auth": {
    "githubClientId": "Ov23...",
    "githubClientSecret": "4a71...",
    "allowedUsername": "your-github-username"
  },
  "sessionSecret": "e7b99c15..."
}
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut                                                                  | Action                                      |
| :------------------------------------------------------------------------ | :------------------------------------------ |
| <kbd>Alt</kbd> + <kbd>T</kbd>                                             | Open a new terminal tab                     |
| <kbd>Alt</kbd> + <kbd>W</kbd>                                             | Close active tab (prompts for confirmation) |
| <kbd>Alt</kbd> + <kbd>1</kbd> .. <kbd>9</kbd>                             | Switch directly to tab 1 through 9          |
| <kbd>Alt</kbd> + <kbd>&larr;</kbd> / <kbd>&rarr;</kbd>                    | Switch to previous / next tab               |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>&larr;</kbd> / <kbd>&rarr;</kbd> | Move active tab position left / right       |
| <kbd>Alt</kbd> + <kbd>R</kbd>                                             | Rename active tab                           |
| Double-click tab                                                          | Inline rename active tab                    |
| <kbd>Alt</kbd> + <kbd>F</kbd>                                             | Toggle fullscreen                           |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>+</kbd> / <kbd>-</kbd>            | Increase / decrease terminal font size      |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>0</kbd>                           | Reset terminal font size                    |
| <kbd>Ctrl</kbd> + <kbd>E</kbd>                                            | Toggle file browser sidebar                 |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>H</kbd>                           | Toggle hidden files in file browser         |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>,</kbd>                           | Open user settings page                     |

---

## 🧪 Development & Testing

```bash
# Run unit, integration, and E2E tests
bun test

# Type-check TypeScript
bun run typecheck

# Lint, format, and check with Biome
bun run check
bun run lint
bun run format

# Build client production bundle
bun run build

# Start server in watch mode
bun run dev
```

---

## 📄 License

MIT
