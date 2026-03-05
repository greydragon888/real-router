---
"@real-router/browser-plugin": minor
---

Remove `mergeState` option and `browser.getState()` (#225)

**Breaking Change:** The `mergeState` option has been removed. The plugin no longer merges router state with existing `history.state` — it fully owns the history state object. `browser.getState()` has been removed from the `Browser` interface as it was only needed for merge logic.
