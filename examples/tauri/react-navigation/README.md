# Tauri + `@real-router/navigation-plugin`

Desktop example for [issue #496](https://github.com/greydragon888/real-router/issues/496). Demonstrates all **9 exclusive methods** of `navigation-plugin` in Tauri v2.

## ⚠️ OS Requirements

This example uses `@real-router/navigation-plugin`, which requires the browser [Navigation API](https://caniuse.com/mdn-api_navigation). In Tauri v2 availability depends on the host OS WebView:

| Host                          | WebView                   | Navigation API         |
| ----------------------------- | ------------------------- | ---------------------- |
| Tauri Windows                 | WebView2 (Chromium)       | ✅ Yes                  |
| Tauri Android                 | Chrome WebView (Chromium) | ✅ Yes                  |
| Tauri macOS ≥ 26.2            | WKWebView                 | ✅ Yes                  |
| Tauri iOS ≥ 26.2              | WKWebView                 | ✅ Yes                  |
| Tauri Linux WebKitGTK ≥ 2.52  | WebKitGTK                 | ✅ Yes                  |
| Tauri macOS ≤ 26.1            | WKWebView                 | ❌ Crashes at startup   |
| Tauri iOS ≤ 26.1              | WKWebView                 | ❌ Crashes at startup   |
| Tauri Linux WebKitGTK ≤ 2.50  | WebKitGTK                 | ❌ Crashes at startup   |

**If your target OS matrix includes any of the ❌ rows — use [`examples/tauri/react`](../react) instead.** It uses `@real-router/browser-plugin`, which works on all WebView versions.

The plugin throws at startup with `[navigation-plugin] Navigation API is not supported` on unsupported systems. This is intentional: failing fast is better than silently degrading, because the exclusive history methods (`peekBack`, `hasVisited`, `traverseToLast`) cannot be emulated without the API.

## Why real-router and not X?

At the time of this example, real-router is the **only** front-end router with first-class Navigation API integration. If you need the exclusive history methods (list of visited routes, visit counts, preview of back/forward entries, traverse-to-last-entry for a route), you are choosing real-router consciously. The OS trade-offs above are part of that choice.

## Quick Start

```bash
pnpm install
pnpm tauri dev      # launches Tauri window with Vite dev server (requires Rust toolchain)
pnpm build          # vite build — frontend only (used by CI)
pnpm preview        # vite preview at http://localhost:4173 (used by e2e)
pnpm test:e2e       # Playwright vs vite preview, 8 tests
```

## Exclusive methods — where to look

| Method | UI location |
| --- | --- |
| `getVisitedRoutes()` | list in `HistoryPanel` |
| `hasVisited(name)` | `✓` suffix on sidebar Link after first visit (`App.tsx`) |
| `getRouteVisitCount(name)` | `× N` next to each visited route |
| `peekBack()` | `← previous: {name}` label |
| `peekForward()` | `next: {name} →` label |
| `canGoBack()` | disabled state of "Back" button |
| `canGoForward()` | disabled state of "Forward" button |
| `canGoBackTo(name)` | disabled state of "Jump to last Dashboard" button |
| `traverseToLast(name)` | onClick of "Jump to last Dashboard" button |

## См. также

- [`examples/tauri/react`](../react) — browser-plugin в Tauri (без OS-ограничений)
- [`examples/electron/react-navigation`](../../electron/react-navigation) — тот же набор методов в Electron (Chromium → API всегда доступен)
- Desktop Integration guide (wiki) — OS compatibility, plugin selection
