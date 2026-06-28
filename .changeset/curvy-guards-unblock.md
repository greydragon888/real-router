---
"@real-router/core": patch
---

Fix `router.navigate()` hanging forever on a non-cooperative async guard (#1018)

- An async `canActivate`/`canDeactivate` guard whose Promise never settles **and** ignores its `signal` no longer wedges the navigation. Previously `stop()`, `dispose()`, and a superseding `navigate()` could not cancel such a navigation and its Promise stayed pending forever (leaking the navigation Promise, its `AbortController`, and the guard closure — notably per request under SSR). `#finishAsyncNavigation` now races the guard completion against the controller's abort, so these all reject the parked navigation with `TRANSITION_CANCELLED`. This mirrors the leave-path protection added in #663/#673.
- Consequence: when an abort (`stop()`/`dispose()`/supersede) precedes a slow guard's own verdict, cancellation now wins — the navigation rejects `TRANSITION_CANCELLED` rather than waiting for the guard's `CANNOT_ACTIVATE`/`CANNOT_DEACTIVATE`. This matches the documented "stop() during guard → TRANSITION_CANCELLED" contract.
