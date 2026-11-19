# Changelog

## [0.6.0-rc3](https://github.com/kilip/knife/compare/v0.7.0-rc2...v0.6.0-rc3) (2026-11-19)


### Features

* ✨ add doctor and self-update cli commands ([7c6c07c](https://github.com/kilip/knife/commit/7c6c07c07a50f9668d5dbd1fbbe8ca47ba871b0b))
* ✨ add host daemon update to settings page ([09abda8](https://github.com/kilip/knife/commit/09abda8de084877b3094e9fea997e30045523c2c))
* ✨ add knife onboarding CLI and remove setup token redirect leak ([90d3e08](https://github.com/kilip/knife/commit/90d3e080bea0478cf8ee56b97c638cae0e898037))
* ✨ add origin middleware and auth rate limiting ([16f3ea2](https://github.com/kilip/knife/commit/16f3ea2ea93129ddf20aff48f6109eba7e70fc7f))
* ✨ add user settings page and preferences api ([dbd11de](https://github.com/kilip/knife/commit/dbd11dee35f8123279565116868ff8a3f590767c))
* ✨ auto close tab on process exit and allow empty tabs ([323596b](https://github.com/kilip/knife/commit/323596bcab1eb18b5f8767c27c82305986b75e9c))
* ✨ read setup token from url fragment ([871d27d](https://github.com/kilip/knife/commit/871d27d35461061cc52292a5c7858c8d54314a18))
* ✨ show connecting overlay in terminal tab ([92028cc](https://github.com/kilip/knife/commit/92028cc5a624f3c66f615d09633048febbb217f0))
* ✨ sync tab title with active cwd top level directory ([fdc2acd](https://github.com/kilip/knife/commit/fdc2acd424cadeb086b8008687728de6773127bd))
* ✨ use headless xterm snapshot for reconnect replay ([07326da](https://github.com/kilip/knife/commit/07326da8e98ee32b374ca587ba82bc20dba58652))


### Bug Fixes

* 🎨 replace public icons and favicon with brand logo ([8ddd45d](https://github.com/kilip/knife/commit/8ddd45d2f52121866602a1dc113704109295001b))
* 🐛 add session id/iat with logout revocation and drop ws sessiontoken ([68df3d5](https://github.com/kilip/knife/commit/68df3d5b5a07399cdfdd5dd3342886bc0ee2dfff))
* 🐛 add touch-drag scrolling for terminal ([1409265](https://github.com/kilip/knife/commit/1409265152f9c2ec072bba538499e5e916b8ead5))
* 🐛 allow inline spa bootstrap scripts via csp nonce ([a298549](https://github.com/kilip/knife/commit/a298549cab2e0d586c753119db6d734c295ec807))
* 🐛 allowlist github oauth users by numeric id instead of login ([a6636be](https://github.com/kilip/knife/commit/a6636be79e0d93fc21a0409d9451eef9f3133e90))
* 🐛 derive sw index.html precache revision from build ([d4355ef](https://github.com/kilip/knife/commit/d4355ef8878552ef0c5fee9d3fd1e5cf05a4c088))
* 🐛 disable cloudflare rocket loader on script tags ([7d9bcbb](https://github.com/kilip/knife/commit/7d9bcbbecd72e23f19ec48e9e3328646c215dea6))
* 🐛 enforce atomic config writes, strict parse, and 0600/0700 perms ([48ecc0e](https://github.com/kilip/knife/commit/48ecc0e49a0cbe015af887bac714bac3a0e19269))
* 🐛 enforce exact origin/sec-fetch-site and json content-type ([d8ad758](https://github.com/kilip/knife/commit/d8ad7586e6796f4127ea5642bbee2e42d3537c85))
* 🐛 ignore changelog.md in biome checks ([97e8320](https://github.com/kilip/knife/commit/97e83207f26be35382282c418a47506e5d1f8c9a))
* 🐛 keep websocket alive in background and restore focus ([fc7c50c](https://github.com/kilip/knife/commit/fc7c50c86f60865ae87cd12b23a7cab8f61ec89a))
* 🐛 open file browser items on single tap for touch ([45e2080](https://github.com/kilip/knife/commit/45e2080d8120a4d957bbfe23f09ea921dc8b8716))
* 🐛 pass -- before filenames in zip invocation ([3bc2ebd](https://github.com/kilip/knife/commit/3bc2ebd13bf10c8296c3f5d1596848bab12256d2))
* 🐛 preserve child processes across systemd restarts ([eb00955](https://github.com/kilip/knife/commit/eb00955ffcc189c710312550132a76b6e0cd1378))
* 🐛 preserve multi-byte UTF-8 characters across PTY chunks ([c84938e](https://github.com/kilip/knife/commit/c84938e66ff3c2a3c3d15d3ebb6fe8619da7d84e))
* 🐛 prevent stored xss on fs download and harden script-src csp ([6035ba2](https://github.com/kilip/knife/commit/6035ba2255cc729b8a8b87ecdf55a16aa0414495))
* 🐛 print startup banner after server binds ([6ace8cc](https://github.com/kilip/knife/commit/6ace8cc725f5e2a284ab1369172a407315d49d0b))
* 🐛 reject unauthenticated ws terminal upgrades ([3198b42](https://github.com/kilip/knife/commit/3198b422254500525c23360c9a800d49df3ffd32))
* 🐛 reject unknown subcommands and arguments ([82aa741](https://github.com/kilip/knife/commit/82aa74174f45a5bbd220aa7076c779f4bf5b8488))
* 🐛 remove broken first-run redirect check on setup page ([7d03c45](https://github.com/kilip/knife/commit/7d03c45740b9ebc3617a6459156e8682b1bfd59c))
* 🐛 require auth and whitelist theme ids on post /api/theme ([722b64e](https://github.com/kilip/knife/commit/722b64ea450fa85975549b7756235c3a9ea3083b))
* 🐛 reset terminal before replaying reconnect snapshot ([b1a8379](https://github.com/kilip/knife/commit/b1a837918261a5e4ade39db48213093d0e33318d))
* 🐛 restrict csp connect-src and add static headers ([03b8dd8](https://github.com/kilip/knife/commit/03b8dd87c59a2f34f8968d49c96926716f53c64f))
* 🐛 stop logging query strings, setup tokens, and noisy requests ([1f2024e](https://github.com/kilip/knife/commit/1f2024eb484e4e5ae7ee4a71f91034824328a3ea))
* 🐛 strip sensitive fields from public endpoints ([f5594cb](https://github.com/kilip/knife/commit/f5594cb660be214d083f2f8db110b04f2eb3104f))
* 🐛 write tabs.json atomically and preserve corrupt files ([f4e4ebe](https://github.com/kilip/knife/commit/f4e4ebe746c5d089c65c4a16ce6ff9ccbe9387d0))


### Refactoring

* ♻️ add shared wire types for tabs and api ([98db656](https://github.com/kilip/knife/commit/98db656224d79557b9b6942296df3ca59bc42494))
* ♻️ add typed api client and persistent state hook ([79b8067](https://github.com/kilip/knife/commit/79b80676318323e3c2d2d75a575993c45b576a7a))
* ♻️ centralize api auth middleware and route tests ([afe1e2c](https://github.com/kilip/knife/commit/afe1e2c5bd6815f35e99419f174192788ca9e973))
* ♻️ extract server cli, middleware, static, terminal ([6529e1e](https://github.com/kilip/knife/commit/6529e1eed6f1158dec152c2c31f8376d8539c7bb))
* ♻️ extract tab, theme, cwd, shortcut hooks from home ([c49802d](https://github.com/kilip/knife/commit/c49802d154efef75517a6ab9f1cf799c8b81ae01))
* ♻️ introduce hono app and migrate core routes ([162aeb1](https://github.com/kilip/knife/commit/162aeb1f6d5703499a34545b0f385f483f306787))
* ♻️ migrate feature routes and drop legacy handler ([c3e23eb](https://github.com/kilip/knife/commit/c3e23ebb2468a4424ea9a4de0bae69e2a551c994))
* ♻️ remove tmux remnants ([8f38c77](https://github.com/kilip/knife/commit/8f38c7724a1b3f3510293674708407939bb984c6))
* ♻️ reorganize app into feature folders ([4b11024](https://github.com/kilip/knife/commit/4b110245d71f0cb68f20916a090680eb91c01d57))
* ♻️ split FileBrowserPanel into useFileBrowser ([62d8e3e](https://github.com/kilip/knife/commit/62d8e3efa873d4bc1feb19297522160415bc98ac))
* ♻️ split TerminalTab into socket and xterm hooks ([2262336](https://github.com/kilip/knife/commit/226233660e1c9c68f5f4247c36eaab8c449b5eb0))


### Documentation

* 📝 document security assumptions in README ([5cfb740](https://github.com/kilip/knife/commit/5cfb7400f1aa1bf4e14c9e1932bf71e7e02b37aa))
* 📝 remove scope section from AGENTS.md ([da60fcb](https://github.com/kilip/knife/commit/da60fcb023c2a74dcb3ecc57bca32e2ac5a21648))
* 📝 update AGENTS.md ([1cb1d9d](https://github.com/kilip/knife/commit/1cb1d9d497fa06b0437fd6053811aa174fcab4c9))
* 📝 update AGENTS.md to match current codebase ([50fa1be](https://github.com/kilip/knife/commit/50fa1be76951202a65104a92a64e404121b40879))
* 📝 update README.md ([f5767f7](https://github.com/kilip/knife/commit/f5767f755f8592cd3c635af2cb9e8e3763f0cd10))
* 📝 update README.md to match current codebase ([c89b580](https://github.com/kilip/knife/commit/c89b5808fdcf0e97b5bac9c9685766b119267503))
* remove commit emoji requirement from AGENTS.md ([dabe12e](https://github.com/kilip/knife/commit/dabe12e229a7f8f7fa60c92310099f801327c45f))


### Miscellaneous Chores

* [RUN] release 0.3.1 ([91394bf](https://github.com/kilip/knife/commit/91394bff3fcdf98f057420870e360e0bdf384320))
* 🔧 release 0.6.0-rc1 ([49b5ea8](https://github.com/kilip/knife/commit/49b5ea838b6adf2f219df6eefd409f8a8b38c05a))
* 🔧 release 0.6.0-rc2 ([c09d237](https://github.com/kilip/knife/commit/c09d237aa07d3f0385b2b959973cda76e05bb42c))
* 🔧 release 0.6.0-rc3 ([37b053b](https://github.com/kilip/knife/commit/37b053be5293e5b0de641898a53e54c43be6e15b))
* 🚀 release 0.3.0 ([c4dc114](https://github.com/kilip/knife/commit/c4dc114139b92e79d044df1c4146be21528b17b5))

## [0.7.0-rc2](https://github.com/kilip/knife/compare/v0.6.0-rc2...v0.7.0-rc2) (2026-11-19)


### Features

* ✨ add doctor and self-update cli commands ([7c6c07c](https://github.com/kilip/knife/commit/7c6c07c07a50f9668d5dbd1fbbe8ca47ba871b0b))

## [0.6.0-rc2](https://github.com/kilip/knife/compare/v0.6.0-rc1...v0.6.0-rc2) (2026-11-19)


### Features

* ✨ show connecting overlay in terminal tab ([92028cc](https://github.com/kilip/knife/commit/92028cc5a624f3c66f615d09633048febbb217f0))


### Bug Fixes

* 🐛 allow inline spa bootstrap scripts via csp nonce ([a298549](https://github.com/kilip/knife/commit/a298549cab2e0d586c753119db6d734c295ec807))
* 🐛 keep websocket alive in background and restore focus ([fc7c50c](https://github.com/kilip/knife/commit/fc7c50c86f60865ae87cd12b23a7cab8f61ec89a))
* 🐛 preserve child processes across systemd restarts ([eb00955](https://github.com/kilip/knife/commit/eb00955ffcc189c710312550132a76b6e0cd1378))
* 🐛 remove broken first-run redirect check on setup page ([7d03c45](https://github.com/kilip/knife/commit/7d03c45740b9ebc3617a6459156e8682b1bfd59c))
* 🐛 reset terminal before replaying reconnect snapshot ([b1a8379](https://github.com/kilip/knife/commit/b1a837918261a5e4ade39db48213093d0e33318d))


### Miscellaneous Chores

* 🔧 release 0.6.0-rc2 ([c09d237](https://github.com/kilip/knife/commit/c09d237aa07d3f0385b2b959973cda76e05bb42c))

## [0.6.0-rc1](https://github.com/kilip/knife/compare/v0.5.0...v0.6.0-rc1) (2026-11-18)


### Features

* ✨ add origin middleware and auth rate limiting ([16f3ea2](https://github.com/kilip/knife/commit/16f3ea2ea93129ddf20aff48f6109eba7e70fc7f))
* ✨ use headless xterm snapshot for reconnect replay ([07326da](https://github.com/kilip/knife/commit/07326da8e98ee32b374ca587ba82bc20dba58652))


### Bug Fixes

* 🐛 derive sw index.html precache revision from build ([d4355ef](https://github.com/kilip/knife/commit/d4355ef8878552ef0c5fee9d3fd1e5cf05a4c088))
* 🐛 write tabs.json atomically and preserve corrupt files ([f4e4ebe](https://github.com/kilip/knife/commit/f4e4ebe746c5d089c65c4a16ce6ff9ccbe9387d0))


### Refactoring

* ♻️ add shared wire types for tabs and api ([98db656](https://github.com/kilip/knife/commit/98db656224d79557b9b6942296df3ca59bc42494))
* ♻️ add typed api client and persistent state hook ([79b8067](https://github.com/kilip/knife/commit/79b80676318323e3c2d2d75a575993c45b576a7a))
* ♻️ centralize api auth middleware and route tests ([afe1e2c](https://github.com/kilip/knife/commit/afe1e2c5bd6815f35e99419f174192788ca9e973))
* ♻️ extract server cli, middleware, static, terminal ([6529e1e](https://github.com/kilip/knife/commit/6529e1eed6f1158dec152c2c31f8376d8539c7bb))
* ♻️ extract tab, theme, cwd, shortcut hooks from home ([c49802d](https://github.com/kilip/knife/commit/c49802d154efef75517a6ab9f1cf799c8b81ae01))
* ♻️ introduce hono app and migrate core routes ([162aeb1](https://github.com/kilip/knife/commit/162aeb1f6d5703499a34545b0f385f483f306787))
* ♻️ migrate feature routes and drop legacy handler ([c3e23eb](https://github.com/kilip/knife/commit/c3e23ebb2468a4424ea9a4de0bae69e2a551c994))
* ♻️ remove tmux remnants ([8f38c77](https://github.com/kilip/knife/commit/8f38c7724a1b3f3510293674708407939bb984c6))
* ♻️ reorganize app into feature folders ([4b11024](https://github.com/kilip/knife/commit/4b110245d71f0cb68f20916a090680eb91c01d57))
* ♻️ split FileBrowserPanel into useFileBrowser ([62d8e3e](https://github.com/kilip/knife/commit/62d8e3efa873d4bc1feb19297522160415bc98ac))
* ♻️ split TerminalTab into socket and xterm hooks ([2262336](https://github.com/kilip/knife/commit/226233660e1c9c68f5f4247c36eaab8c449b5eb0))


### Documentation

* 📝 update README.md ([f5767f7](https://github.com/kilip/knife/commit/f5767f755f8592cd3c635af2cb9e8e3763f0cd10))


### Miscellaneous Chores

* 🔧 release 0.6.0-rc1 ([49b5ea8](https://github.com/kilip/knife/commit/49b5ea838b6adf2f219df6eefd409f8a8b38c05a))

## [0.5.0](https://github.com/kilip/knife/compare/v0.4.1...v0.5.0) (2026-11-17)


### Features

* ✨ add knife onboarding CLI and remove setup token redirect leak ([90d3e08](https://github.com/kilip/knife/commit/90d3e080bea0478cf8ee56b97c638cae0e898037))
* ✨ read setup token from url fragment ([871d27d](https://github.com/kilip/knife/commit/871d27d35461061cc52292a5c7858c8d54314a18))


### Bug Fixes

* 🐛 add session id/iat with logout revocation and drop ws sessiontoken ([68df3d5](https://github.com/kilip/knife/commit/68df3d5b5a07399cdfdd5dd3342886bc0ee2dfff))
* 🐛 allowlist github oauth users by numeric id instead of login ([a6636be](https://github.com/kilip/knife/commit/a6636be79e0d93fc21a0409d9451eef9f3133e90))
* 🐛 enforce atomic config writes, strict parse, and 0600/0700 perms ([48ecc0e](https://github.com/kilip/knife/commit/48ecc0e49a0cbe015af887bac714bac3a0e19269))
* 🐛 enforce exact origin/sec-fetch-site and json content-type ([d8ad758](https://github.com/kilip/knife/commit/d8ad7586e6796f4127ea5642bbee2e42d3537c85))
* 🐛 ignore changelog.md in biome checks ([97e8320](https://github.com/kilip/knife/commit/97e83207f26be35382282c418a47506e5d1f8c9a))
* 🐛 pass -- before filenames in zip invocation ([3bc2ebd](https://github.com/kilip/knife/commit/3bc2ebd13bf10c8296c3f5d1596848bab12256d2))
* 🐛 preserve multi-byte UTF-8 characters across PTY chunks ([c84938e](https://github.com/kilip/knife/commit/c84938e66ff3c2a3c3d15d3ebb6fe8619da7d84e))
* 🐛 prevent stored xss on fs download and harden script-src csp ([6035ba2](https://github.com/kilip/knife/commit/6035ba2255cc729b8a8b87ecdf55a16aa0414495))
* 🐛 print startup banner after server binds ([6ace8cc](https://github.com/kilip/knife/commit/6ace8cc725f5e2a284ab1369172a407315d49d0b))
* 🐛 reject unauthenticated ws terminal upgrades ([3198b42](https://github.com/kilip/knife/commit/3198b422254500525c23360c9a800d49df3ffd32))
* 🐛 require auth and whitelist theme ids on post /api/theme ([722b64e](https://github.com/kilip/knife/commit/722b64ea450fa85975549b7756235c3a9ea3083b))
* 🐛 restrict csp connect-src and add static headers ([03b8dd8](https://github.com/kilip/knife/commit/03b8dd87c59a2f34f8968d49c96926716f53c64f))
* 🐛 stop logging query strings, setup tokens, and noisy requests ([1f2024e](https://github.com/kilip/knife/commit/1f2024eb484e4e5ae7ee4a71f91034824328a3ea))
* 🐛 strip sensitive fields from public endpoints ([f5594cb](https://github.com/kilip/knife/commit/f5594cb660be214d083f2f8db110b04f2eb3104f))


### Documentation

* 📝 document security assumptions in README ([5cfb740](https://github.com/kilip/knife/commit/5cfb7400f1aa1bf4e14c9e1932bf71e7e02b37aa))
* 📝 remove scope section from AGENTS.md ([da60fcb](https://github.com/kilip/knife/commit/da60fcb023c2a74dcb3ecc57bca32e2ac5a21648))
* 📝 update AGENTS.md ([1cb1d9d](https://github.com/kilip/knife/commit/1cb1d9d497fa06b0437fd6053811aa174fcab4c9))
* remove commit emoji requirement from AGENTS.md ([dabe12e](https://github.com/kilip/knife/commit/dabe12e229a7f8f7fa60c92310099f801327c45f))

## [0.4.1](https://github.com/kilip/knife/compare/v0.4.0...v0.4.1) (2026-11-17)

### Bug Fixes

- 🎨 replace public icons and favicon with brand logo ([8ddd45d](https://github.com/kilip/knife/commit/8ddd45d2f52121866602a1dc113704109295001b))
- 🐛 add touch-drag scrolling for terminal ([1409265](https://github.com/kilip/knife/commit/1409265152f9c2ec072bba538499e5e916b8ead5))
- 🐛 open file browser items on single tap for touch ([45e2080](https://github.com/kilip/knife/commit/45e2080d8120a4d957bbfe23f09ea921dc8b8716))

### Documentation

- 📝 update AGENTS.md to match current codebase ([50fa1be](https://github.com/kilip/knife/commit/50fa1be76951202a65104a92a64e404121b40879))
- 📝 update README.md to match current codebase ([c89b580](https://github.com/kilip/knife/commit/c89b5808fdcf0e97b5bac9c9685766b119267503))

## [0.4.0](https://github.com/kilip/knife/compare/v0.3.1...v0.4.0) (2026-11-13)

### Features

- ✨ add host daemon update to settings page ([09abda8](https://github.com/kilip/knife/commit/09abda8de084877b3094e9fea997e30045523c2c))
- ✨ auto close tab on process exit and allow empty tabs ([323596b](https://github.com/kilip/knife/commit/323596bcab1eb18b5f8767c27c82305986b75e9c))

## [0.3.1](https://github.com/kilip/knife/compare/v0.3.0...v0.3.1) (2026-11-12)

### Miscellaneous Chores

- [RUN] release 0.3.1 ([91394bf](https://github.com/kilip/knife/commit/91394bff3fcdf98f057420870e360e0bdf384320))

## 0.3.0 (2026-11-12)

### Features

- ✨ add user settings page and preferences api ([dbd11de](https://github.com/kilip/knife/commit/dbd11dee35f8123279565116868ff8a3f590767c))
- ✨ sync tab title with active cwd top level directory ([fdc2acd](https://github.com/kilip/knife/commit/fdc2acd424cadeb086b8008687728de6773127bd))

### Bug Fixes

- 🐛 reject unknown subcommands and arguments ([82aa741](https://github.com/kilip/knife/commit/82aa74174f45a5bbd220aa7076c779f4bf5b8488))

### Miscellaneous Chores

- 🚀 release 0.3.0 ([c4dc114](https://github.com/kilip/knife/commit/c4dc114139b92e79d044df1c4146be21528b17b5))
