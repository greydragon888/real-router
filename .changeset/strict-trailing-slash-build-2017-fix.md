---
"@real-router/core": minor
---

`trailingSlash: "strict"` builds the form it demands (#2017)

`"strict"` reached the matcher only as the construction flag
`strictTrailingSlash`, which makes matching demand exact trailing-slash-ness,
while the per-call build options dropped it — so `buildPath` printed the
un-normalised path and the router refused its own href. A route declared `/b/`
committed `state.path` `/b`, which that same router's `matchPath` did not match;
the idiomatic index child `{ path: "/" }` under a parent was unusable.

`buildPath` now resolves `"strict"` per route, from the COMPILED
`hasTrailingSlash` — so it prints the route's own form and the round-trip holds.
Measured across 11 route shapes, `"never"` / `"always"` / `"preserve"` are
byte-identical to before.

`minor`, not `patch`: under `"strict"` the printed path changes. Every changed
case was previously unroutable by its own matcher, with one behavioural
consequence worth naming — a splat VALUE ending in `/` (`{ rest: "a/b/" }` on
`/f/*rest`) is now printed without it, the same normalisation `"never"` already
performs, because the route declares no trailing slash.
