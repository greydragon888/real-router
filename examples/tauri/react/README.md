# Tauri + `@real-router/browser-plugin`

Desktop example for [issue #496](https://github.com/greydragon888/real-router/issues/496). Demonstrates `browser-plugin` inside a Tauri v2 window — URL scheme is `tauri://localhost` (macOS/iOS/Linux) or `https://tauri.localhost` (Windows/Android).

## Quick Start

```bash
pnpm install
pnpm tauri dev      # launches Tauri window with Vite dev server (requires Rust toolchain)
pnpm build          # vite build — frontend only (used by CI)
pnpm preview        # vite preview at http://localhost:4173 (used by e2e)
pnpm test:e2e       # Playwright vs vite preview, 5 tests
```

Для полной сборки native-приложения: `pnpm tauri build` → `src-tauri/target/release/bundle/*`. Требует Rust toolchain + платформенные deps (webkit2gtk на Linux, Xcode CLI на macOS).

## Как это работает без правки `safeParseUrl`

До этапа 1 `browser-plugin` использовал `new URL(url, globalThis.location.origin)` + whitelist `["http:", "https:"]`:

- На **macOS/iOS/Linux** Tauri грузит UI с `tauri://localhost/` — схема `tauri:` не в whitelist → плагин логировал `"Invalid URL protocol"` и возвращал `null`. Любая попытка `matchUrl`/popstate молча проваливалась.
- На **Windows/Android** схема `https:` проходила whitelist — там плагин работал. Разработчики на этих OS могли не заметить проблему до тестирования на других платформах.

После правки в этапе 1 (`06ccab93`) `safeParseUrl` scheme-agnostic — работает на всех 4 OS единообразно.

## CI vs локальная проверка

- **CI** — только frontend: `pnpm build` + Playwright против `vite preview` (Chromium на http://localhost:4173). Не требует Rust / Tauri runtime.
- **Локально перед merge** — обязательно прогнать `pnpm tauri dev` на одном из supported OS, чтобы проверить реальный `tauri://` scheme в DevTools.

Manual check:
```bash
pnpm tauri build
./src-tauri/target/release/real-router-tauri-browser-demo
# In DevTools → Network: URL starts with tauri:// (macOS/iOS/Linux)
#   or https://tauri.localhost (Windows/Android)
```

## См. также

- [`examples/tauri/react-navigation`](../react-navigation) — Tauri + navigation-plugin + OS requirements
- [`examples/electron/react`](../../electron/react) — эквивалент на Electron с custom `app://` protocol
- Desktop Integration guide (wiki) — OS compatibility, plugin selection
