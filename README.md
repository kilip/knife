# knife 🔪

A single-user self-hosted web terminal with multi-tab support, backed by tmux so sessions survive browser refreshes, network disconnects, and server restarts. Runs on Linux only and designed to be served behind a reverse proxy (e.g. Caddy) on a user-configured public domain.

---

## Highlights

- **Persistent tmux sessions**: Each tab maps to a dedicated session on an isolated tmux socket (`tmux -L knife`) using a knife-owned minimal config. Your own tmux sessions are completely unaffected.
- **Resilient WebSockets**: Closing the tab or refreshing the page only detaches the client; tmux keeps running in the background. Auto-reconnect with exponential backoff and application-level ping/pong heartbeats.
- **Native Bun PTY**: Uses Bun's native `Bun.Terminal` PTY engine (no native C++ addons or node-pty compilation needed).
- **React Router 8 + Tailwind CSS**: Clean single-page application built on React Router 8 (framework mode) with CSS-variable-driven theming.
- **Full xterm.js feature set**: Fit, WebLinks, WebGL with Canvas/DOM fallbacks, Unicode 11, OSC 52 clipboard sync, truecolor (24-bit), and mouse reporting.
- **5 Built-in Themes**: Catppuccin Mocha (default), Tokyo Night, Nord, Gruvbox Dark, and Dracula. One unified definition powers both Tailwind UI tokens and the 16-color terminal palette, with zero flash on initial load.
- **Single-User Security**: GitHub OAuth 2.0 restricted to a single configured username. First-run wizard protected by a one-time console setup token.
- **Progressive Web App (PWA)**: Serwist-powered service worker with precached application shell, standalone installability, offline banner, safe-area insets, and dynamic theme-color meta synchronization.
- **Integrated File Browser & Transfers**: Left-docked split pane on desktop and slide-over drawer on mobile. Breadcrumbs navigation, sortable flat list, hidden files toggle, inline previews for text & images (<2MB), two-way drag-and-drop (drop desktop files onto the terminal canvas to upload to active tab CWD; drag browser files to paste shell-escaped paths), demand-driven tmux CWD synchronization, on-the-fly streaming `.zip` downloads with zero disk staging, and floating transfer queue drawer with speed and progress indicators.

---

## Architecture Overview

```
Browser Client (React Router 8, xterm.js)
       │
       ▼ (HTTPS / WSS)
Reverse Proxy (Caddy / Nginx, terminates TLS)
       │
       ▼ (HTTP / WS on loopback, e.g. 127.0.0.1:3000)
Knife Bun HTTP & WebSocket Server
       │
       ├─► Bun.Terminal PTY (tmux attach-session -t knife-<id>)
       │         │
       │         ▼
       └─► Dedicated tmux daemon (-L knife socket, config data/knife-tmux.conf)
                 ├── knife-tab-1 (Shell 1)
                 ├── knife-tab-2 (Shell 2)
                 └── knife-tab-3 (Shell 3)
```

- **WebSocket Reconnect**: On reconnection or server restart, knife reconciles active tmux sessions with `tabs.json`. Active sessions are re-adopted seamlessly without losing your terminal scrollback or running processes.
- **Explicit Close**: Explicitly closing a tab terminates its tmux session (`tmux -L knife kill-session -t knife-<id>`) with user confirmation.

---

## Prerequisites

- **Linux** (x86_64 or aarch64)
- **Bun** (v1.2+)
- **tmux** (v3.0+)

Install tmux if not already present:

```bash
# Debian / Ubuntu
sudo apt-get install -y tmux

# Arch Linux
sudo pacman -S tmux

# Fedora / RHEL
sudo dnf install -y tmux
```

---

## Quick Start

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

On initial startup, knife generates a cryptographically secure one-time setup token and prints a clickable setup URL to your console:

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

## Background Service (`knife service`)

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
  - **Windows**: Installs a user logon task via Windows Task Scheduler or system service via `sc.exe`.
  - `--config <path>`: Explicit path to `config.json` (auto-detects existing config by default).
  - `--dir <path>`: Working directory for state and storage.
  - `-p, --port <port>`: Explicit port override.
  - `--host <ip>`: Explicit host override.
  - `--system`: Install as a system-wide daemon (requires `sudo` / Administrator).
- **`knife service start`**: Starts the registered background service.
- **`knife service stop`**: Stops the running service.
- **`knife service restart`**: Restarts the service.
- **`knife service status`**: Displays current status (running/stopped/failed), PID, listening endpoint, active setup link (if first-run setup is pending), and recent logs.
- **`knife service uninstall`**: Stops, unregisters, and removes the service unit without deleting your `config.json` or tab data.

---

## Reverse Proxy Setup (Caddy)

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

## Configuration Reference

Configuration precedence:

```
CLI Flags > Environment Variables > config.json > Defaults
```

### CLI Flags

- `--host <ip>`: Listen host (default: `127.0.0.1`)
- `-p, --port <number>`: Listen port (default: `3000`)
- `-d, --domain <domain>`: Public domain (default: `""` or `KNIFE_PUBLIC_DOMAIN`)
- `--config <path>`: Path to `config.json` (default: `./config.json`)
- `-h, --help`: Display help

### Environment Variables

- `KNIFE_HOST`: Listen host address
- `KNIFE_PORT`: Listen port number
- `KNIFE_PUBLIC_DOMAIN`: Public domain (e.g. `knife.itstoni.com`)
- `KNIFE_CONFIG_PATH`: Path to configuration file
- `KNIFE_DATA_DIR`: Directory for tabs persistence and tmux config
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

## Keyboard Shortcuts

| Shortcut                                                                  | Action                                      |
| :------------------------------------------------------------------------ | :------------------------------------------ |
| <kbd>Alt</kbd> + <kbd>T</kbd>                                             | Open a new terminal tab                     |
| <kbd>Alt</kbd> + <kbd>W</kbd>                                             | Close active tab (prompts for confirmation) |
| <kbd>Alt</kbd> + <kbd>1</kbd> .. <kbd>9</kbd>                             | Switch directly to tab 1 through 9          |
| <kbd>Alt</kbd> + <kbd>&larr;</kbd> / <kbd>&rarr;</kbd>                    | Switch to previous / next tab               |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>&larr;</kbd> / <kbd>&rarr;</kbd> | Move active tab position left / right       |
| <kbd>Alt</kbd> + <kbd>R</kbd>                                             | Rename active tab                           |
| Double-click tab                                                          | Inline rename active tab                    |
| <kbd>Ctrl</kbd> + <kbd>E</kbd>                                            | Toggle file browser sidebar                 |
| <kbd>Ctrl</kbd> + <kbd>H</kbd>                                            | Toggle hidden files in file browser         |
| <kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>,</kbd>                           | Open user settings page                     |

---

## Development & Testing

```bash
# Run unit, integration, and E2E tests
bun test

# Type-check TypeScript
bun run typecheck

# Build client production bundle
bun run build

# Start server in watch mode
bun run dev
```

---

## License

MIT
