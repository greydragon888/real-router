---
"@real-router/navigation-plugin": minor
---

Adapt `buildUrl` / `replaceHistoryState` + `NavigationHistoryEntry` state to the RFC-4 M2 params/search slot-shift (#1548)

`buildUrl(name, params?, search?, options?)` **and**
`replaceHistoryState(name, params?, search?, options?)` gain the query channel at
position 3; the `{ hash }` options object shifts to position 4. The navigate-event
handler passes the query channel through to `buildUrl`, a caller-supplied `search`
on `replaceHistoryState` lands in the built state / URL, and the `history.state`
buffer written into each `NavigationHistoryEntry` now carries the `search` field
alongside `{ name, params, path }` — so `entry.getState()` reflects the path/query
split.

**Breaking (pre-1.0, positional slot-shift):** `buildUrl` / `replaceHistoryState`
callers passing `{ hash }` at position 3 move it to position 4 (query channel now
occupies 3). `entry.getState()` consumers gain a `search` field.
