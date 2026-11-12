# AGENTS.md

Guidance for AI coding agents working on **knife** (`@kilip/knife`): a single-user, self-hosted web terminal (multi-tab, PWA, file browser) that runs on Bun and sits behind a TLS-terminating reverse proxy.

## Scope discipline (don't overdo)

Do what was asked, nothing more. If the request is ambiguous, ask instead of guessing broadly.

- **No unrequested changes:** no drive-by refactors, renames, reformatting, dependency bumps, or "cleanup" in code you weren't asked to touch. If you spot an unrelated problem, mention it in your reply and leave it alone.
- **No unrequested features or files:** don't add new options, endpoints, abstractions, config keys, docs, or tests beyond what the task needs. Tests for the code you changed are fine; a new test framework or a sweeping test rewrite is not.
- **No unrequested git actions:** don't commit, push, tag, open PRs, or bump versions unless explicitly told to. Never rewrite history.
- **No unrequested side effects:** don't install or remove packages, change CI/release config, touch `config.json` or `data/`, or run destructive commands (`rm -rf`, force operations) unless the task requires it.
- **Keep diffs minimal and focused:** one logical change per task, matching the existing style of the surrounding code.
- **Don't expand a fix into a redesign.** If the right solution is bigger than what was asked, describe it and let the user decide.

## Stack

- **Runtime:** Bun 1.2+ (server uses `Bun.serve`, `Bun.Terminal`, `Bun.spawn`). Linux is the primary target; `server/service/` also has launchd/Windows managers.
- **Client:** React 19 + React Router 8 in **framework mode with `ssr: false`** (SPA), Vite, Tailwind CSS 4, xterm.js 6, Serwist (PWA).
- **Language:** TypeScript 7, `strict`. Path alias `~/*` -> `app/*`.
- **Package manager:** Bun only (`bun.lock`). Never add `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml`.

## Commands

```bash
bun install
bun run dev          # server in watch mode (server/index.ts)
bun run build        # react-router build -> build/client
bun start            # run server (serves build/client + API + WS)
bun run typecheck    # react-router typegen && tsc --noEmit
bun run lint         # biome lint
bun run format       # biome format --write
bun test             # bun:test, all of tests/
```

CI (`.github/workflows/ci.yml`) runs, in order: `bun install --frozen-lockfile` -> `typecheck` -> `build` -> `test`. Make all four pass locally before finishing a change.

## Repository layout

```
bin/knife.js          CLI shim: runs server/index.ts under Bun, or delegates to `bun` from Node
server/
  index.ts            Single Bun.serve entry: CLI parsing, routing, auth gates, static files (~1000 lines)
  config.ts           CLI > env > config.json > defaults
  auth.ts             Setup token, HMAC session cookie, GitHub OAuth helpers
  proxy.ts            Trusted-proxy handling, client IP
  ws.ts               WebSocket handler, per-tab PTY registry, reconnect/replay
  pty.ts              PtySession (Bun.Terminal + login shell, 128 KB rolling buffer)
  tmux.ts / shell.ts  Optional tmux helpers, user shell detection
  storage.ts          tabs.json persistence + data dir resolution
  fs.ts               File browser backend, path normalization, protected paths, zip streaming
  update.ts           Self-update (version check, package manager detection, restart)
  service/            `knife service ...` (systemd / launchd / Windows managers)
app/
  routes.ts           index (home), /setup, /login
  routes/             home.tsx (terminal UI), setup.tsx, login.tsx
  components/         TerminalTab, TabBar, FileBrowser/*, QuickKeysBar, SelfUpdateModal, Pwa*
  hooks/              useFileTransfer, useSelfUpdate, usePwa
  utils/themes.ts     Single source of truth for UI tokens + xterm palette
  sw.ts               Serwist service worker
tests/                bun:test suites (unit + e2e)
public/               PWA manifest and icons
```

## Architecture notes

- **Single process serves everything:** static SPA from `build/client`, `/api/*`, `/auth/*`, and the `/ws/terminal` WebSocket. Routing is hand-written `url.pathname` matching in `server/index.ts`. There is no Express/Hono.
- **Terminal sessions:** each tab = a `TabData` (`id`, `name`, `sessionName = knife-<id>`, `order`, `createdAt`) persisted in `<dataDir>/tabs.json`. `ws.ts` keeps live `PtySession`s in an in-memory map keyed by `tabId`. A disconnect starts a grace timer (60s) before the PTY is killed; reconnecting replays the rolling output buffer.
- **tmux status (read this before touching terminal code):** the current implementation defaults to a **direct user-shell PTY** (`pty.ts` spawns `$SHELL -l`). tmux is _optional_: `isTmuxInstalled()` gates only auxiliary behavior such as CWD lookup and session cleanup in `server/index.ts`. `README.md` still describes tmux-backed persistence (`tmux -L knife`) as the core feature, so README and code have drifted. Do not assume either is authoritative without reading `ws.ts`/`pty.ts`; if you change session behavior, update the README too.
- **Auth model:** single user. First run enters setup mode with a one-time console token (`/setup?token=...`); afterwards GitHub OAuth restricted to `allowedUsername`. Sessions are HMAC-signed `knife_session` cookies (`HttpOnly; SameSite=Lax`, `Secure` when public scheme is https). Use `timingSafeEqual` for any secret comparison.
- **Config & data:** `config.json` and `data/` are gitignored and must never be committed. Data dir resolves via `KNIFE_DATA_DIR`, else `data/` next to the config, else `./data`.
- **Themes:** defined once in `app/utils/themes.ts` (UI tokens + 16-color xterm palette, 5 themes). Add or change colors there only, not in component CSS.
- **PWA:** the service worker must never intercept `/api/`, `/ws/` or `/auth/` (see `navigateFallbackDenylist` in `app/sw.ts`). `skipWaiting: false` is deliberate so an update never drops live terminals; the user applies updates through the UI.

## Security rules (do not weaken)

- Every `/api/*` and WebSocket route requires a valid session, except explicit public ones (`/health`, `/api/config/public`, setup/auth endpoints).
- WebSocket upgrades are checked with `isAllowedOrigin` against the configured public domain.
- File browser access goes through `normalizePath` and `isProtectedPath` in `server/fs.ts`. Protected paths include system paths, the knife install root, `config.json` and the data dir. New file operations must call these before touching disk.
- Trust `X-Forwarded-*` headers only from configured `trustedProxies`.
- Never log or return `githubClientSecret`, `sessionSecret`, session tokens, or the setup token (except the intentional one-time console print).

## Conventions

- **Server code:** plain functions and small modules; `node:` prefixed imports; log with bracketed prefixes (`[server]`, `[ws]`, `[pty]`, `[http]`). Catch with `unknown` and narrow (`err instanceof Error ? err.message : String(err)`).
- **Client code:** function components + hooks, Tailwind utility classes driven by CSS variables from the theme system, `lucide-react` for icons. Keep route modules in `app/routes/` and reusable UI in `app/components/`.
- **Keep it dependency-light.** Prefer Bun built-ins and `node:` APIs; justify any new runtime dependency. No native addons (the project deliberately avoids `node-pty`).
- **Platform-specific code** belongs in `server/service/managers/*`, not in the shared server modules.
- **Dependency updates:** managed by **Renovate** (`renovate.json`). Don't bump versions or edit `bun.lock` by hand unless the task is specifically about a dependency; leave `renovate.json` alone unless asked.
- **Lint & format:** **Biome** is the single tool for both. Follow its config; don't add ESLint or Prettier, and don't hand-format against it. Always format (`bun run format`) before committing.

## Testing

- Framework: `bun:test` (`describe` / `it` / `expect`). Tests live in `tests/*.test.ts` and import from `../server/...` or `../app/...` directly.
- Use `os.tmpdir()` + random suffix for scratch dirs and clean up in `afterAll`. Never write into the real `data/` or `config.json`.
- Add or update tests alongside changes to: auth, config precedence, fs guardrails, proxy trust, service managers, update logic, themes, PWA.
- `tests/e2e.test.ts` boots the real server; keep it hermetic (temp data dir, random port).

## Commits, versioning, releases

- **Conventional Commits are required**, with a Unicode emoji at the start of the subject: `<type>: <emoji> <subject>` (scope is forbidden). release-please generates the changelog and version from them, and it only parses the `type` prefix, so the emoji is safe.
  - Examples: `feat: ✨ add quick keys toolbar`, `fix: 🐛 use relative redirect paths`, `chore: 🔧 bump deps`, `feat!: 💥 drop tmux requirement`.
  - Use a real Unicode character (not a `:shortcode:`), exactly one emoji, then a single space, then a lowercase imperative subject.
  - Do not use scopes (`feat(scope):` will fail commitlint; use `feat:`).
  - The emoji always comes _after_ `type:`, never before the type.
  - Keep the whole subject line (including `type:` and the emoji) at **80 characters or fewer**.
  - Enforced locally by **Husky** git hooks + **commitlint**. Never bypass hooks (`--no-verify`); fix the message instead.
  - Visible in changelog: `feat`, `fix`, `perf`, `refactor`, `docs`.
  - Hidden: `chore`, `ci`, `test`, `style`.
  - Breaking changes: `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer.
- **Do not hand-edit** `CHANGELOG.md`, the `version` in `package.json`, or `.github/.release-please-manifest.json`; release-please owns them.
- Tags have no component prefix (`include-component-in-tag: false`).
- The published package ships only: `bin`, `build`, `server`, `public`, `README.md`, `LICENSE`. If you add a runtime directory, add it to `files` in `package.json`.

## Before you finish

1. `bun run format`, and `bun run typecheck && bun run build && bun test` all pass.
   Biome lint/format is clean.
2. No secrets, `config.json`, or `data/` in the diff.
3. User-facing behavior changes are reflected in `README.md` (CLI flags, env vars, shortcuts, architecture).
4. Commit message follows `type: <emoji> subject` (Conventional Commits + Unicode emoji).
