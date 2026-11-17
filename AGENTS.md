# AGENTS.md

Guidance for AI coding agents working on **knife** (`@kilip/knife`): a single-user, self-hosted web terminal (multi-tab, PWA, file browser) that runs on Bun behind a TLS-terminating reverse proxy.

## Stack

- **Runtime:** Bun 1.2+ (`Bun.serve`, `Bun.Terminal`, `Bun.spawn`). Linux is the primary target.
- **Client:** React 19 + React Router 8 in framework mode with **`ssr: false`** (SPA), Vite, Tailwind 4, xterm.js, Serwist (PWA).
- **Language:** TypeScript, `strict`. Alias `~/*` -> `app/*`.
- **Package manager:** Bun only. Never add `package-lock.json`, `yarn.lock` or `pnpm-lock.yaml`.

## Commands

```bash
bun run dev         # server in watch mode
bun run build       # react-router build -> build/client
bun run typecheck   # react-router typegen && tsc --noEmit
bun run format      # biome format --write
bun run check       # biome ci . (lint + format + import sorting)
bun test            # bun:test, all of tests/
```

CI runs `bun install --frozen-lockfile` -> `check` -> `typecheck` -> `build` -> `test`. All must pass locally before finishing.

## Architecture notes

- **Single process** serves the SPA, `/api/*`, `/auth/*` and the `/ws/terminal` WebSocket. Routing is hand-written `url.pathname` matching in `server/index.ts` (no Express/Hono).
- **Sessions:** each tab is a `TabData` persisted in `<dataDir>/tabs.json`; `server/ws.ts` keeps live `PtySession`s keyed by `tabId`. On disconnect a 60s grace timer runs before the PTY is killed; reconnecting replays the rolling buffer.
- **Direct PTY:** sessions spawn `$SHELL -l` directly via `Bun.Terminal` (`server/pty.ts`). If you change session behavior, update `README.md`.
- **Auth:** single user. First run uses a one-time console setup token; afterwards GitHub OAuth limited to `allowedUsername`. Sessions are HMAC-signed cookies. Use `timingSafeEqual` for secret comparison.
- **Config & data:** `config.json` and `data/` are gitignored; never commit them.
- **Themes:** colors live only in `app/utils/themes.ts`, not in component CSS.
- **PWA:** the service worker must never intercept `/api/`, `/ws/` or `/auth/`. `skipWaiting: false` is deliberate so updates never drop live terminals.
- **Platform-specific code** goes in `server/service/managers/*`, not shared modules.

## Security rules (do not weaken)

- Every `/api/*` and WebSocket route requires a valid session, except explicit public ones (`/health`, `/api/config/public`, setup/auth endpoints).
- WebSocket upgrades must pass `isAllowedOrigin`.
- File operations must go through `normalizePath` and `isProtectedPath` (`server/fs.ts`) before touching disk.
- Trust `X-Forwarded-*` only from configured `trustedProxies`.
- Never log or return `githubClientSecret`, `sessionSecret`, session tokens, or the setup token (except the one-time console print).

## Conventions

- Keep it dependency-light: prefer Bun built-ins and `node:` APIs, no native addons (no `node-pty`). Justify any new runtime dependency.
- Biome is the only linter/formatter. Don't add ESLint or Prettier.
- Renovate owns dependency updates. Don't hand-edit `bun.lock` or `renovate.json`.
- Tests: `bun:test` in `tests/*.test.ts`. Use temp dirs, never the real `data/` or `config.json`. Keep `tests/e2e.test.ts` hermetic (temp data dir, random port).

## Commits

Commit only when asked. When you do, make every commit **atomic**:

- **One logical change per commit.** It should be revertable on its own without breaking anything else.
- **Each commit builds and passes** `typecheck` and `test` by itself. Never leave a broken intermediate state.
- **Keep the change with its tests and docs.** Code, its tests, and the `README.md` update it needs go in the same commit.
- **Keep unrelated work apart:** refactors, formatting, dependency changes and features each get their own commit.
- **Stage deliberately** with `git add -p` or explicit paths, never `git add -A` blindly. Check `git diff --staged` before committing.
- **Split large work** into a sequence of small commits instead of one big one.
- **Keep history linear.** No merge commits: rebase onto the base branch (`git pull --rebase`) and fast-forward or squash-merge PRs. Rebase only your own unpublished commits.

Message format (Conventional Commits, enforced by Husky + commitlint; never use `--no-verify`):

- `<type>: <subject>`, e.g. `feat: add quick keys toolbar`, `fix: use relative redirect paths`.
- No scope. Lowercase imperative subject. Whole line <= 80 characters.
- Breaking changes: `feat!:` or a `BREAKING CHANGE:` footer.
- Do not hand-edit `CHANGELOG.md`, `version` in `package.json`, or `.github/.release-please-manifest.json`; release-please owns them.
- PRs and issues must use the templates in `.github/`.

## Before you finish

1. `bun run format`, then `typecheck`, `build` and `test` all pass.
2. No secrets, `config.json` or `data/` in the diff.
3. User-facing changes are reflected in `README.md`.
