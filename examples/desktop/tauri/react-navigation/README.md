# Tauri + `@real-router/navigation-plugin`

Demonstrates all **9 exclusive methods** of `navigation-plugin` in Tauri v2. Unlike `browser-plugin`, this plugin depends on the browser [Navigation API](https://caniuse.com/mdn-api_navigation), and in Tauri that depends on the host OS WebView — see the compatibility table below.

## ⚠️ OS Requirements

| Host                          | WebView                   | Navigation API        |
| ----------------------------- | ------------------------- | --------------------- |
| Tauri Windows                 | WebView2 (Chromium)       | ✅ Yes                |
| Tauri Android                 | Chrome WebView (Chromium) | ✅ Yes                |
| Tauri macOS ≥ 26.2            | WKWebView                 | ✅ Yes                |
| Tauri iOS ≥ 26.2              | WKWebView                 | ✅ Yes                |
| Tauri Linux WebKitGTK ≥ 2.52  | WebKitGTK                 | ✅ Yes                |
| Tauri macOS ≤ 26.1            | WKWebView                 | ❌ Crashes at startup |
| Tauri iOS ≤ 26.1              | WKWebView                 | ❌ Crashes at startup |
| Tauri Linux WebKitGTK ≤ 2.50  | WebKitGTK                 | ❌ Crashes at startup |

**If your target OS matrix includes any of the ❌ rows, use [`examples/desktop/tauri/react`](../react) instead** — it uses `browser-plugin`, which works on all WebView versions.

The plugin throws `[navigation-plugin] Navigation API is not supported` at startup on unsupported WebViews. Failing fast is intentional: the exclusive history methods (`peekBack`, `hasVisited`, `traverseToLast`, …) cannot be emulated without the API.

## Why `navigation-plugin` at all

At the time of this example, real-router is the only front-end router with first-class Navigation API integration. Pick this example when you need the exclusive history methods:

- List of routes the user has visited in this session.
- Visit count per route name.
- Preview of what back / forward would land on (`peekBack`, `peekForward`).
- Jump-to-last-visit-for-a-route (`traverseToLast`) without stepping through intermediate entries.

The OS compatibility trade-off above is part of that choice. If you only need `pushState` / `replaceState` + back / forward, [`examples/desktop/tauri/react`](../react) is the safer default.

## Quick Start

```bash
pnpm install
pnpm tauri dev      # launches a Tauri window with Vite dev server (requires Rust toolchain)
pnpm build          # vite build (frontend only)
pnpm preview        # vite preview at http://localhost:4173
pnpm test:e2e       # Playwright against vite preview
```

## What it covers

Every exclusive `navigation-plugin` method has a visible hook in the UI:

| Method                     | UI location                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `getVisitedRoutes()`       | `HistoryPanel` — list of route names                           |
| `hasVisited(name)`         | `✓` suffix on a sidebar link after its first visit (`App.tsx`) |
| `getRouteVisitCount(name)` | `× N` next to each entry in the visited list                   |
| `peekBack()`               | `← previous: {name}` label above the history buttons           |
| `peekForward()`            | `next: {name} →` label                                         |
| `canGoBack()`              | disabled state of the `Back` button                            |
| `canGoForward()`           | disabled state of the `Forward` button                         |
| `canGoBackTo(name)`        | disabled state of the `Jump to last Dashboard` button          |
| `traverseToLast(name)`     | `onClick` of the `Jump to last Dashboard` button               |

## See also

- [`examples/desktop/tauri/react`](../react) — browser-plugin in Tauri, no OS caveats
- [`examples/desktop/electron/react-navigation`](../../electron/react-navigation) — same plugin in Electron, Chromium on every OS
- [Desktop Integration guide (wiki)](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) — plugin × OS compatibility matrix
