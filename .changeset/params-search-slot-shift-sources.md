---
"@real-router/sources": minor
---

Adapt to the RFC-4 M2 params/search slot-shift (#1548)

`createActiveRouteSource` now calls `router.isActiveRoute` with the query channel
at position 3 (unused here — the active-route source compares the single param
bag), so `strictEquality` / `ignoreQueryParams` land in their shifted slots.
