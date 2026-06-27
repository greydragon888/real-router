---
"@real-router/vue": patch
---

Stabilize `<Link>` `routeParams` by content to cut per-navigation re-render cost (#990)

The Vue `<Link>` now collapses structurally-equal `routeParams` to a stable
reference with `shallowEqual` (Object.is per key, order-insensitive — the same
contract as the React adapter's `Link` `memo` comparator) instead of hashing
them with `canonicalJson` on every navigation.

A parent that hands an inline `:routeParams="{ id }"` literal allocates a fresh
object on each render; previously every navigation re-ran `canonicalJson`
(`JSON.stringify` + key sort) **and** recomputed `buildHref`. Now same-shape
navigations skip both — the `href` and active-class derivations only recompute
when params content actually changes.

Measured **+19.3%** navigation throughput on the Link-heavy `vs-tanstack` Vue
benchmark (168.95 → 201.49 hz, formal `vitest bench` same-session A/B, RME
±0.9%; Apple M3 Pro / jsdom), and ~28% on an isolated 20-`Link` micro-bench.

No public API or behavior change. Nested-object param **values** are compared by
reference (shallow) rather than deep-serialized, so a parent that mutates a
nested params object in place — or hands a fresh deep-equal nested object and
relies on it being treated as unchanged — should stabilize it with a
`ref`/`computed`, exactly as already documented for the React `Link`.
