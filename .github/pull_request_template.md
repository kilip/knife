<!--
Title convention:
- Plain imperative sentence case (e.g. "Add quick keys toolbar and shortcuts").
- No commit type prefixes or emoji (no "feat:", "fix:", "✨"). Labels carry category metadata.
- Max ~65 characters, no trailing period.
-->

## Summary

<!-- What changed and why. Link related issues, for example "Closes #123". -->

## Changes

<!-- Key changes, grouped by area (server/PTY, web UI, file browser, CLI/service, tooling). -->

-

## How it was verified

<!-- Commands you ran and manual checks you performed. State anything you could not run. -->

-

## Checklist

- [ ] `bun run lint`, `bun run typecheck`, `bun run build`, and `bun test` pass for the code I touched.
- [ ] `bun run format` was run (Biome format is clean).
- [ ] PR title uses plain imperative sentence case without commit type/emoji prefixes.
- [ ] Generated files were not edited by hand.
- [ ] No new dependency or stack change, or it was approved in the linked issue.
- [ ] No secrets, tokens, session cookies, `config.json`, or `data/` are committed or logged.
- [ ] `AGENTS.md`, `README.md`, or code documentation is updated if a convention or behavior changed.
- [ ] No manual edits to `CHANGELOG.md`, `package.json` version, or `.github/.release-please-manifest.json`.

## Notes for reviewers

<!-- Risks, trade-offs, follow-up work, or areas that deserve extra attention. -->
