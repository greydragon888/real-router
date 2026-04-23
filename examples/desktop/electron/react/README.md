# Electron + `@real-router/browser-plugin` (`app://`)

Demonstrates `browser-plugin` with History API inside an Electron window served through a custom `app://` scheme.

## Quick Start

```bash
pnpm install
pnpm dev            # Vite HMR + Electron window pointed at it
pnpm build          # tsc + vite build → dist/ + dist-electron/
pnpm start          # launches Electron with the production bundle
pnpm test:e2e       # Playwright via _electron.launch
```

## What it covers

- `createRouter(routes)` + `browserPluginFactory()` + `router.start()`
- Custom `app://` privileged scheme registered in the Electron main process (`electron/main.ts`)
- Clean URLs without hash prefix, full browser history (back / forward, deep-linking)
- Nested routes (`users` → `users.user` → `users.user.edit`), `Link`, `RouteView` with `Match` segments

## Why a custom protocol instead of `file://`

The History API throws `SecurityError` on `pushState` when the document is served from `file://`. A privileged scheme (`standard: true` in `protocol.registerSchemesAsPrivileged`) makes the window behave like a normal `http://` origin, which unlocks `pushState` / `replaceState`.

If registering a custom protocol is not an option (for example, porting a Create-React-App project with minimal changes to the main process), use hash routing — see [`examples/desktop/electron/react-hash`](../react-hash).

## See also

- [`examples/desktop/electron/react-hash`](../react-hash) — hash-plugin + `file://`
- [`examples/desktop/electron/react-navigation`](../react-navigation) — navigation-plugin + exclusive history methods
- [`examples/desktop/tauri/react`](../../tauri/react) — same plugin in Tauri
- [Desktop Integration guide (wiki)](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) — plugin × OS compatibility matrix
