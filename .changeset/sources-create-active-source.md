---
"@real-router/sources": minor
---

feat(sources): add `createActiveSource` — the shared fast/slow active-source builder (#1416)

Promotes the framework-agnostic fast/slow decision for an adapter `<Link>`'s
active-route source into `@real-router/sources`, where it belongs (it uses only
`createActiveNameSelector` + `createActiveRouteSource`). A default-options link
(non-empty `routeName`, no custom params, non-strict, query-ignoring, no hash)
shares the per-router `createActiveNameSelector` (one subscription for any number
of distinct-name links); anything else falls to the per-link
`createActiveRouteSource`. Adapter Links (vue `<Link>`, angular `RealLink` /
`RealLinkActive`) now route through this one builder instead of each keeping a
copy — one source of truth for the decision + the `routeName !== ""` guard,
closing the drift that produced #1416.
