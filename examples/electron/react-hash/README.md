# Electron + `@real-router/hash-plugin` (`file://` + `#!/`)

Desktop example for [issue #496](https://github.com/greydragon888/real-router/issues/496). Demonstrates hash-routing inside an Electron window loaded directly from `file://` — the fallback path when registering a custom protocol is not an option.

## Quick Start

```bash
pnpm install
pnpm dev            # Vite HMR at http://localhost:5173, Electron window points to it
pnpm build          # tsc + vite build → dist/ + dist-electron/
pnpm start          # launches Electron with file:///.../dist/index.html#!/ (prod)
pnpm test:e2e       # Playwright + _electron.launch, 5 tests
```

## Как это работает без правки `safeParseUrl`

На `file://` URL'ах старый `safeParseUrl` ломался в двух местах:

1. `globalThis.location.origin` на `file://` возвращает строку `"null"` → `new URL(url, "null")` бросает `TypeError`.
2. Схема `file:` не входила в whitelist `["http:", "https:"]` → плагин логировал `"Invalid URL protocol"` и возвращал `null`.

Hash-plugin особенно страдал: href вида `file:///.../dist/index.html#!/dashboard` — абсолютный URL, который плагин пытался распарсить через `safeParseUrl`, но обе проверки срабатывали одновременно.

После правки в этапе 1 (`06ccab93`) парсер scheme-agnostic — `file://` работает как любой другой origin.

## Почему hash, а не custom protocol

- Не требует `app.whenReady()` + `protocol.registerSchemesAsPrivileged()` — Electron грузит файл напрямую.
- Подходит для миграции существующих Create-React-App приложений без переписывания main-process.
- History API на `file://` всё равно бросает `SecurityError` — hash-routing обходит эту проблему.

Если возможно зарегистрировать custom protocol — предпочитай [`examples/electron/react`](../react): чистые URL'ы без `#!/` префикса.

## См. также

- [`examples/electron/react`](../react) — browser-plugin + `app://` custom protocol
- [`examples/electron/react-navigation`](../react-navigation) — navigation-plugin + эксклюзивные методы истории
- Desktop Integration guide (wiki) — OS compatibility matrix, plugin selection
