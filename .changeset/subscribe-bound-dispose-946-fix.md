---
"@real-router/core": patch
---

Throw `ROUTER_DISPOSED` from a bound `subscribe`/`subscribeLeave` reference used after `dispose()` (#946)

A subscription reference captured before `dispose()` — `const s = router.subscribe.bind(router)` — bypassed the facade's `#markDisposed` swap (which replaces only `router.subscribe`, not a copy already bound out of it) and reached the live `EventBusNamespace`. Since `dispose()` had already run `clearAll()`, `emitter.on` simply recreated the listener `Set` and added the listener — which could then NEVER fire (the FSM is `DISPOSED`, no future emit): a silent no-op / stuck-UI hazard. Core now enforces the disposed state inside `EventBusNamespace.subscribe` and `subscribeLeave` themselves, so a pre-bound reference throws `RouterError(ROUTER_DISPOSED)` — consistent with a direct post-dispose call. Applied symmetrically to both end-user subscription surfaces.
