# Electron + `@real-router/navigation-plugin`

Desktop example for [issue #496](https://github.com/greydragon888/real-router/issues/496). Demonstrates all **9 exclusive methods** of `navigation-plugin` in a working Electron window with custom `app://` scheme.

## Quick Start

```bash
pnpm install
pnpm dev            # Vite HMR at http://localhost:5173, Electron window points to it
pnpm build          # tsc + vite build → dist/ + dist-electron/
pnpm start          # launches Electron with app://real-router/ (prod)
pnpm test:e2e       # Playwright + _electron.launch, 8 tests
```

## Why Electron (not Tauri) for navigation-plugin

`navigation-plugin` requires the [Navigation API](https://caniuse.com/mdn-api_navigation). Electron always ships Chromium → the API is available **on every OS** without version caveats.

In Tauri the API is only present on:
- Tauri Windows (WebView2)
- Tauri Android (Chrome WebView)
- Tauri macOS ≥ 26.2 / iOS ≥ 26.2 (WKWebView with Safari 26.2)
- Tauri Linux WebKitGTK ≥ 2.52

See the compatibility matrix in [issue #496](https://github.com/greydragon888/real-router/issues/496) and the [`examples/tauri/react-navigation`](../../tauri/react-navigation) example for the Tauri-specific guidance.

## Exclusive methods — where to look

| Method | UI location |
| --- | --- |
| `getVisitedRoutes()` | list in `HistoryPanel` |
| `hasVisited(name)` | `✓` suffix on sidebar Link after first visit |
| `getRouteVisitCount(name)` | `× N` next to each visited route |
| `peekBack()` | `← previous: {name}` label |
| `peekForward()` | `next: {name} →` label |
| `canGoBack()` | disabled state of "Back" button |
| `canGoForward()` | disabled state of "Forward" button |
| `canGoBackTo(name)` | disabled state of "Jump to last Dashboard" button |
| `traverseToLast(name)` | onClick of "Jump to last Dashboard" button |

## См. также

- [`examples/electron/react`](../react) — browser-plugin + `app://`
- [`examples/electron/react-hash`](../react-hash) — hash-plugin + `file://`
- [`examples/tauri/react-navigation`](../../tauri/react-navigation) — navigation-plugin в Tauri (с OS requirements)
- Desktop Integration guide (wiki) — plugin selection, OS compatibility
