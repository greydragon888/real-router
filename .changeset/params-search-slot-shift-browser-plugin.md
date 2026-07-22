---
"@real-router/browser-plugin": minor
---

Adapt `buildUrl` / `replaceHistoryState` to the RFC-4 M2 params/search slot-shift (#1548)

`buildUrl(name, params?, search?, options?)` **and**
`replaceHistoryState(name, params?, search?, options?)` gain the query channel at
position 3; the `{ hash }` options object shifts to position 4. The plugin threads
`search` into core's now-search-aware `router.buildPath`, so a caller-supplied
`search` on `replaceHistoryState` lands in the built state and the rebuilt URL, and
`history.state` written by `replaceHistoryState` / `onTransitionSuccess` carries the
new `search` field alongside `{ name, params, path }`.

**Breaking (pre-1.0, positional slot-shift):** `buildUrl` / `replaceHistoryState`
callers passing `{ hash }` at position 3 move it to position 4 (query channel now
occupies 3).
