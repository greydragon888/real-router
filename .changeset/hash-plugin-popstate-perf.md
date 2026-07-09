---
"@real-router/hash-plugin": patch
---

Skip the redundant popstate-success `replaceState` on back/forward when it is provably a no-op (#1353)

On a browser back/forward the engine has already restored the target entry's `{name, params, path}` and URL before firing `popstate`, so re-writing them via `replaceState` was a value-level no-op that still fired a second `updateForSameDocumentNavigation` Blink event per navigation. The plugin now skips the write when the resolved target deep-equals the live `history.state` (same path + `areStatesEqual`). Every load-bearing case keeps the write: redirect/normalization (path or params differ), corrupted or missing `history.state`, and custom `Browser` implementations without a state reader.
