# Tauri + `@real-router/browser-plugin`

Demonstrates `browser-plugin` inside a Tauri v2 window. The URL scheme is `tauri://localhost` on macOS / iOS / Linux and `https://tauri.localhost` on Windows / Android.

## Quick Start

```bash
pnpm install
pnpm tauri dev      # launches a Tauri window with Vite dev server (requires Rust toolchain)
pnpm build          # vite build (frontend only)
pnpm preview        # vite preview at http://localhost:4173
pnpm test:e2e       # Playwright against vite preview
```

Full native bundle: `pnpm tauri build` produces artifacts under `src-tauri/target/release/bundle/`. Requires a Rust toolchain and per-platform dependencies (`webkit2gtk-4.1` on Linux, Xcode Command Line Tools on macOS, etc.).

## What it covers

- `createRouter(routes)` + `browserPluginFactory()` + `router.start()`
- History API routing inside a Tauri WebView on all four platforms (macOS, Windows, Linux, iOS/Android)
- Nested routes with deep linking — direct load of `/users/42/edit` decodes params at all three levels
- `Link`, `RouteView` with `Match` segments, browser back/forward preservation

## Why `browser-plugin` in Tauri (and not `navigation-plugin`)

`browser-plugin` uses the History API, which every Tauri WebView supports out of the box, on every supported OS version. This example is the safe default for Tauri apps with a broad OS matrix.

If you need the exclusive history methods (visited-routes list, visit counts, `peekBack` / `peekForward`, `traverseToLast`), use [`examples/tauri/react-navigation`](../react-navigation) and accept its OS compatibility trade-offs.

## See also

- [`examples/tauri/react-navigation`](../react-navigation) — navigation-plugin in Tauri, with OS compatibility notes
- [`examples/electron/react`](../../electron/react) — same plugin in Electron with a custom `app://` protocol
- [Desktop Integration guide (wiki)](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) — plugin × OS compatibility matrix
