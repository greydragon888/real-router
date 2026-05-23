---
"@real-router/core": patch
---

Settle FSM at DISPOSED regardless of pre-dispose state (#660)

`routerFSM` only declared `DISPOSE → DISPOSED` from `IDLE`. If the FSM was
stuck in `STARTING` (e.g. the start pipeline threw between `sendStart()` and
`sendStarted()/sendFail()` — typically a misbehaving start interceptor),
the subsequent `sendDispose()` was a no-op and `isActive()` / `isDisposed()`
returned stale truth after `router.dispose()`. Mutating methods were already
guarded by `#markDisposed()`, but the state-query API leaked the stuck-FSM
state.

`DISPOSE → DISPOSED` is now wired from `STARTING`, `READY`,
`TRANSITION_STARTED`, and `LEAVE_APPROVED` so `dispose()` always settles the
FSM at `DISPOSED`. Healthy flows are unaffected — the facade still routes
through `IDLE` via `stop()`/`sendCancelIfPossible()`.
