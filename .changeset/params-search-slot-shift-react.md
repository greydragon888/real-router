---
"@real-router/react": minor
---

Adapt to the RFC-4 M2 params/search slot-shift (#1548)

`Link` / `InkLink` navigation and the shared `navigateWithHash` / scroll-spy DOM
helpers pass the query channel at navigate position 3 (unused — a link's query
rides in `routeParams` until the descriptor-aware `to` prop lands) and options at
position 4, matching core's new `navigate(name, params, search, opts)` signature.
