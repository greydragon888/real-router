---
"@real-router/validation-plugin": minor
---

Add proactive listener-count threshold for `subscribe` / `addEventListener` (#1188)

Listeners were the only resource counter without an early-warning threshold: plugins, lifecycle handlers and dependencies each get a `warn@20% / error@50%` signal (`computeThresholds`), but the listener counter silently accumulated up to the core hard cap (`maxListeners`, default 10 000) before throwing a bare `Error`. The plugin now emits an actionable `[router.subscribe]` / `[router.addEventListener]` warn/error well before that cap, catching a listener leak (e.g. a missing `unsubscribe`, #766) early. Core keeps its bare-`Error` hard cap as the structural backstop — this only adds the opt-in DX signal, restoring symmetry across all four resource counters.
