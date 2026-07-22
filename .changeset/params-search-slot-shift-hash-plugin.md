---
"@real-router/hash-plugin": minor
---

Adapt `buildUrl` to the RFC-4 M2 params/search slot-shift (#1548)

`buildUrl(name, params?, search?, options?)` gains the query channel at position 3;
the `{ hash }` options object shifts to position 4. The plugin's internal
`pluginBuildUrl` forwards `search` into core's now-search-aware `router.buildPath`,
so a `#/items?id=5` URL builds its query from the dedicated channel.

**Breaking (pre-1.0, positional slot-shift):** `buildUrl` callers passing
`{ hash }` at position 3 move it to position 4 (query channel now occupies 3).
