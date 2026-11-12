---

name: Bug report
about: Report something that is not working as expected
title: ""
labels: ["bug", "needs-triage"]
assignees: ""
---

<!--
Title convention:
- Plain sentence case describing the symptom or needed fix (e.g. "WebSocket drops on Safari mobile backgrounding").
- No commit type prefixes or emoji (no "fix:", "bug:", "🐛"). Labels carry category metadata.
- Max ~65 characters, no trailing period.
-->

## Summary

<!-- A clear and concise description of the bug. -->

## Steps to reproduce

1.
2.
3.

## Expected behavior

<!-- What you expected to happen. -->

## Actual behavior

<!-- What actually happened. Include screenshots for UI / terminal rendering problems. -->

## Environment

- Knife version or commit:
- Bun version (`bun --version`):
- Host OS & architecture (`uname -a` or OS version):
- How Knife runs: foreground (`knife` / `bun start`) / service (`knife service ...`) / Docker
- Reverse proxy (if any): Caddy / Nginx / Traefik / Cloudflare / none
- Browser and version (for UI / terminal issues):
- Shell on host (`echo $SHELL`):

## Logs

<!--
Paste relevant server logs (`[server]`, `[ws]`, `[pty]`, `[http]`) or browser console errors.
Do not paste secrets, session tokens, or config values.
-->

```text

```

## Additional context

<!-- Anything else that helps, such as tmux usage, client device, network setup. -->
