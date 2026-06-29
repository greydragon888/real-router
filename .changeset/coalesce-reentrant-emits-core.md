---
"@real-router/core": minor
---

Unify the event-reentrancy model: coalesce re-entrant emits; remove `RecursionDepthError` and `maxEventDepth` (#1033)

**Breaking change (pre-1.0).** The internal event emitter no longer bounds recursion with a configurable `maxEventDepth` that throws `RecursionDepthError`. Instead, a re-entrant emit of an event already being dispatched is **coalesced** to a no-op — an event can never re-enter its own dispatch (depth ≤ 1), so recursion is structurally impossible (no stack-overflow path).

- `RecursionDepthError` is **no longer exported** from `@real-router/core` — it can never throw now. Remove any `instanceof RecursionDepthError` checks: re-entrant route-CRUD throws `REENTRANT_TREE_MUTATION` (#1032) and re-entrant navigation throws `REENTRANT_NAVIGATION` (#1030), both synchronously at the call site before mutating.
- The `maxEventDepth` limit is removed from `RouterOptions.limits` (see `@real-router/types`).
- Observable effect: `replace()` (or `navigateToNotFound()`) called from inside a transition listener no longer emits a nested `TRANSITION_SUCCESS` — its `setState` still updates the active state; only the redundant nested re-notification is coalesced. `replace()` from outside a dispatch is unaffected.
