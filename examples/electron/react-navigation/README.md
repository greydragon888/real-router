# Electron + `@real-router/navigation-plugin`

Demonstrates all **9 exclusive methods** of `navigation-plugin` inside an Electron window served through a custom `app://` scheme.

## Quick Start

```bash
pnpm install
pnpm dev            # Vite HMR + Electron window pointed at it
pnpm build          # tsc + vite build → dist/ + dist-electron/
pnpm start          # launches Electron with the production bundle
pnpm test:e2e       # Playwright via _electron.launch
```

## Why Electron, not Tauri, for `navigation-plugin`

`navigation-plugin` requires the browser [Navigation API](https://caniuse.com/mdn-api_navigation). Electron always ships Chromium, so the API is available on every OS without version caveats.

Tauri, by contrast, uses the host system's WebView:
- Windows (WebView2) and Android (Chrome WebView) — Navigation API is available.
- macOS ≥ 26.2, iOS ≥ 26.2 — available (WKWebView with Safari 26.2).
- Linux WebKitGTK ≥ 2.52 — available.
- Older macOS / iOS / Linux WebViews — **not available**, and the plugin throws at startup.

See [`examples/tauri/react-navigation`](../../tauri/react-navigation) for the Tauri-specific compatibility matrix and trade-offs.

## What it covers

Every exclusive `navigation-plugin` method has a visible hook in the UI:

| Method                      | UI location                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `getVisitedRoutes()`        | `HistoryPanel` — list of route names                            |
| `hasVisited(name)`          | `✓` suffix on a sidebar link after its first visit              |
| `getRouteVisitCount(name)`  | `× N` next to each entry in the visited list                    |
| `peekBack()`                | `← previous: {name}` label above the history buttons            |
| `peekForward()`             | `next: {name} →` label                                          |
| `canGoBack()`               | disabled state of the `Back` button                             |
| `canGoForward()`            | disabled state of the `Forward` button                          |
| `canGoBackTo(name)`         | disabled state of the `Jump to last Dashboard` button           |
| `traverseToLast(name)`      | `onClick` of the `Jump to last Dashboard` button                |

## See also

- [`examples/electron/react`](../react) — browser-plugin + `app://`
- [`examples/electron/react-hash`](../react-hash) — hash-plugin + `file://`
- [`examples/tauri/react-navigation`](../../tauri/react-navigation) — same plugin in Tauri, with OS requirements
- [Desktop Integration guide (wiki)](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) — plugin × OS compatibility matrix
