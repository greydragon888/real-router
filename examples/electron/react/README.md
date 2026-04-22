# Electron + `@real-router/browser-plugin` (custom `app://`)

Desktop example for [issue #496](https://github.com/greydragon888/real-router/issues/496). Demonstrates the `browser-plugin` with History API inside an Electron window served through a custom `app://` scheme.

## Quick Start

```bash
pnpm install
pnpm dev            # Vite HMR at http://localhost:5173, Electron window points to it
pnpm build          # tsc + vite build → dist/ + dist-electron/
pnpm start          # launches Electron with app://real-router/ (prod)
pnpm test:e2e       # Playwright + _electron.launch, 6 tests
```

## Как это работает без правки `safeParseUrl`

До этапа 1 `browser-plugin` использовал `new URL(url, globalThis.location.origin)` в `safeParseUrl`. В Electron с custom scheme `app://` две проверки ломали плагин:

1. `globalThis.location.origin` на `app://` окне возвращал `"null"` (строку) в ряде Electron-сценариев → `TypeError` в `new URL(...)`.
2. Whitelist `["http:", "https:"]` отвергал любую navigation через scheme `app:` — `matchUrl`/popstate warn + возвращает `null`, плагин молча не работает.

После правки в этапе 1 (`06ccab93`) `safeParseUrl` работает без `new URL()` и без whitelist — `app://` scheme полностью поддерживается.

## Почему custom protocol, а не `file://`

History API на `file://` бросает `SecurityError` при `pushState`. Для History-based routing нужен privileged scheme с `standard: true`, что и даёт `app://` (см. `electron/main.ts`).

Если custom protocol нельзя настроить (например, при переносе существующего CRA-приложения в Electron), используй hash-routing — см. [`examples/electron/react-hash`](../react-hash).

## См. также

- [`examples/electron/react-hash`](../react-hash) — hash-plugin + `file://`
- [`examples/electron/react-navigation`](../react-navigation) — navigation-plugin + эксклюзивные методы истории
- [`examples/tauri/react`](../../tauri/react) — эквивалент на Tauri
- Desktop Integration guide (wiki) — OS compatibility matrix, plugin selection
