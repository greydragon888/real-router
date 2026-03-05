---
"@real-router/browser-plugin": minor
---

Remove legacy artifacts from Browser interface (#228)

**BREAKING CHANGE:**

- `mergeState` option removed from `BrowserPluginOptions`
- `browser.getState()` removed from `Browser` interface
- `pushState` / `replaceState` signature changed from `(state, title, path)` to `(state, path)`
- `HistoryState` type removed
- `isHistoryState` no longer re-exported
