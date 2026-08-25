---
"@real-router/search-schema-plugin": patch
---

A validated schema result no longer disappears between the plugin and the URL (#1852)

The plugin rebuilds `params` and `search` key by key with `dst[key] = value`,
under names taken from the route and from the caller's state. That is `[[Set]]`,
so an accessor on `Object.prototype` under one of those names took the write.
Measured on `/users/:id`:

- a getter-only or non-writable property REJECTED the navigation outright;
- a getter+setter pair lost the path slot silently and left core reporting
  `[SegmentMatcher.buildPath] Missing required param 'id'` about a value the
  caller had supplied;
- on the query side the schema ran, reported success, and its output reached
  neither `state.search` nor the printed URL.

`omitKeys` (`helpers.ts`) was the first site any non-path key reached and was
not in the original sweep — found by probing each write rather than reasoning
from the one that was reported. All four now use `putField` from
`@real-router/core/utils`.

Part of #1901.
