---
"@real-router/core": patch
---

Preserve a guard-thrown `RouterError(TRANSITION_CANCELLED)` instead of re-coding it (#933)

A route guard that throws `RouterError(TRANSITION_CANCELLED)` to quietly cancel a
transition was observed by the caller as `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE`.
`handleGuardError` only special-cased a `DOMException` `AbortError`, so an explicit
cancellation `RouterError` fell through to `rethrowAsRouterError`, whose `setCode`
overwrote the code — turning the intended quiet cancel into a reported transition
error (`onTransitionError` fired, `routeTransitionError` emitted a fail).

`handleGuardError` now preserves a thrown `RouterError` whose code is already
`TRANSITION_CANCELLED`, mirroring the existing `AbortError` → `TRANSITION_CANCELLED`
handling. Other thrown `RouterError`s (e.g. `TRANSITION_ERR`) are still re-coded as
before.
