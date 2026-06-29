---
"@real-router/core": patch
---

Pre-flight the lifecycle handler-limit check (#961) into the route-CRUD PREPARE phase so `add`/`replace`/`update` stay atomic (#1046). Previously, with `@real-router/validation-plugin` installed and the per-type handler count at `maxLifecycleHandlers`, a CRUD op that registered a new guard slot threw the limit `RangeError` *after* the tree/config swap — leaving a partial mutation (`update`'s `forwardTo` committed, `add`'s routes in the swapped tree, `replace`'s old tree destroyed). The limit is now projected per type before any store write (against surviving external guards for `replace`'s clear-then-register), so a limit-exceeding op aborts with the prior state fully intact.
