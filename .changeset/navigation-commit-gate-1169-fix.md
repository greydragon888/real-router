---
"@real-router/core": patch
---

fix(core): cancel in-flight navigation on stop()/dispose()/abort from a transition listener (#1169)

A synchronous `stop()`, `dispose()`, or external `opts.signal` abort issued from inside a transition listener (`subscribeLeave`, or a plugin's `onTransitionStart`) no longer commits the superseded navigation. Previously such a navigation could resolve with `TRANSITION_SUCCESS` — and, after `dispose()`, resurrect the FSM out of its terminal `DISPOSED` state into a zombie router (`isActive() === true` on a disposed instance).

The fix has two structural parts: the three hot navigation transitions (`NAVIGATE`/`LEAVE_APPROVE`/`COMPLETE`) now go through the FSM transition table (`send()`) instead of the `forceState()` bypass, so a transition from an invalid state is a table no-op that emits nothing — the FSM table is the sole authority over state and cannot be resurrected. A pre-commit liveness gate (active only when a listener window is reachable) then refuses the `setState` that precedes it, so the navigation rejects with `RouterError(TRANSITION_CANCELLED)` and the router stays stopped/disposed. `forceState()` is no longer called anywhere in core.

Performance note: this trades a hot-path micro-optimization for a structural determinism guarantee — routing the three transitions through the table costs roughly +15–20% on the `navigate/*` benchmarks (still sub-microsecond) and one small transition-payload allocation per navigation. The router's cancellation correctness is now enforced by the state machine rather than by scattered re-checks.
