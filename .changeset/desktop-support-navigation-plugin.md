---
"@real-router/navigation-plugin": minor
---

Desktop environments support (Electron, Tauri) (#496)

`safeParseUrl` (shared with `browser-plugin`) no longer depends on `globalThis.location.origin` and no longer filters by scheme. The plugin now works in desktop webviews with non-HTTP origins, subject to Navigation API availability (Safari 26.2+, WebKitGTK 2.52+, Chromium-based webviews).

**What changed**

- URL parsing is now scheme-agnostic. `matchUrl()`, `peekBack()`, `peekForward()`, `hasVisited()`, `getVisitedRoutes()`, `traverseToLast()`, `canGoBackTo()` work against any `NavigationHistoryEntry.url`, regardless of scheme.
- `extractPathFromAbsoluteUrl` / `urlToPath` signatures dropped the unused `context` parameter; the parser is total (always returns a string).

**Migration**

No source changes required. For developers targeting WKWebView (macOS/iOS ≤ 26.1) or WebKitGTK ≤ 2.50, prefer `@real-router/browser-plugin` — `navigation-plugin` extensions (`peekBack`, `peekForward`, `traverseToLast`, etc.) have no automatic downgrade and will throw at runtime if the Navigation API is missing.
