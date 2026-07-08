---
"@real-router/core": patch
---

fix(core): stop() during the STARTING window now cancels the start (#1185)

`router.stop()` called while `start()` is parked in an async start-interceptor (before it calls `next()`, FSM = STARTING) was a silent no-op: the facade's early return fired (STARTING is neither ready nor transitioning), `STARTING` accepted neither STOP nor CANCEL, and when the interceptor resumed the pipeline completed normally — the router ended up READY with a committed state, breaking the documented "stop() during start cancels the transition" contract (wiki/start.md) and the "after stop(), isActive() === false" invariant.

The FSM table now accepts `STARTING --STOP--> IDLE`; the facade's `stop()` sends STOP when the router is starting; and `RouterLifecycleNamespace.start` (the start-interceptor target) re-checks `isIdle()` after the interceptor chain, rejecting with `TRANSITION_CANCELLED` when a stop() cancelled the start mid-window — mirroring the guard phase, which already cancels from TRANSITION_STARTED. A `dispose()` in the same window is unaffected: it leaves the FSM DISPOSED, which the commit primitives' liveness gate still rejects as `ROUTER_DISPOSED` (#1186), so a stop and a dispose stay distinguishable.
