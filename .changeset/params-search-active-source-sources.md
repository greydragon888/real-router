---
"@real-router/sources": minor
---

Active-route sources carry the query (search) channel — RFC-4 M2 (#1548)

`createActiveRouteSource(router, name, params?, search?, opts?)` and the shared
`createActiveSource` builder gain a `search` argument at position 3; `opts` (and
`createActiveSource`'s trailing flags) shift by one. `search` participates in the
cache key and is forwarded to `router.isActiveRoute`, so a query-scoped active
check (`ignoreQueryParams: false`) can distinguish `?page=2` from `?page=3`. A
`search`-bearing call also forces the slow path — the name-only
`createActiveNameSelector` fast path is query-blind. Default matching (no
`search`, `ignoreQueryParams: true`) is unchanged.

**Breaking (pre-1.0, positional slot-shift):** `createActiveRouteSource` callers
passing `opts` at position 3 move it to position 4 (query channel now occupies 3).
