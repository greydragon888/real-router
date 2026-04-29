---
"@real-router/sources": minor
---

`createActiveRouteSource` accepts optional `hash` to compute hash-aware active state (#532)

`ActiveRouteSourceOptions` gains an optional `hash` field. When defined, the
source treats a route as active iff:

1. `router.isActiveRoute(name, params, strict, ignoreQueryParams)` returns
   `true`, AND
2. `state.context.url.hash` (decoded, populated by the URL plugins) equals
   the requested fragment exactly.

The cache key now includes `hash`, so a Link pointing to `/settings#account`
shares its source only with consumers using the same routeName + params +
hash. Sources with `hash === undefined` retain the legacy route-only active
semantics — no behavior change for callers that don't pass the new option.

Hash-plugin runtimes leave `state.context.url` undefined, so any non-undefined
`hash` option produces `false` there — consistent with the documented
limitation that hash-plugin doesn't support URL fragments.

This unlocks tab-style UI in `<Link hash>` across all six framework adapters:
the matching variant lights up `activeClassName="active"` automatically, no
manual workaround needed.

`stabilizeState` (used by `createRouteSource`) now also compares
`state.context.url.hash`. Previously it short-circuited on `path` only — so
`useRoute()` consumers would not re-render on same-path-different-hash
transitions (the hash flipped in the URL, but the rendered tab content
stayed stale). Treating hash as render identity fixes tab-style UIs that
subscribe via `useRoute()` instead of (or in addition to) `<Link>`'s
hash-aware active state.
