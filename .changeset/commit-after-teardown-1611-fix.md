---
"@real-router/core": patch
---

fix(core): a router torn down mid-commit no longer gets the commit (#1611)

`completeTransition` runs exactly one piece of application code before `setState`: the post-leave cleanup clears the external `canDeactivate` guard, and when a **definition** factory survives that clear the slot is recompiled by invoking it. A factory that calls `router.dispose()` or `router.stop()` is violating its documented contract (guard factories must be side-effect-free with respect to the router), but the failure mode was silent state corruption rather than an error: `setState` proceeded, `navigate()` **resolved with success**, and `COMPLETE` from `DISPOSED` / `IDLE` is a table no-op — so no `TRANSITION_SUCCESS` ever reached subscribers. The router ended up holding a state it committed after it was terminated, and nothing was told.

The #1169 commit-gate could not see it: it sits *before* `completeTransition`, i.e. on the far side of that user code, and is gated on `suspendable` while this reproduces on the uncancellable `completeImmediate` arc (#1588) — which `forceDeactivate: true` selects. The defect is positional, not arc-specific: the check happened on one side of the user code and the commit on the other.

The commit is now re-checked on the same side as the user code, and the navigation rejects with `TRANSITION_CANCELLED` — the same outcome a caller already gets when a listener stops the router mid-flight. The question asked is `isTransitioning()` rather than `isActive()`, which additionally covers a factory that starts a **nested navigation**: that runs to completion and leaves the FSM in `READY`, so the outer commit used to silently overwrite the nested one's result. The check is gated on whether anything was actually cleared, so a navigation that runs no factory pays a boolean on the `#307` hot path, and the arc allocates no `AbortController` — verified by counting.

Two adjacent cells are deliberately out of this fix and remain open: a nested navigation still *in flight* (the FSM is inside its transition, so the question answers for somebody else), and the `replace()`-revalidation commit path, which has no liveness check of its own.
