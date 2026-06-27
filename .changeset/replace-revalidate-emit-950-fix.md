---
"@real-router/core": patch
---

Fix: `replace()` notifies `router.subscribe` listeners when it revalidates the active state (#950)

`getRoutesApi(router).replace(routes)` revalidated the currently-active state at the end of the swap by writing it directly (`setState` / `clearState`) without emitting a transition event — only the internal `TREE_CHANGED` fired. So `router.subscribe` / `useSyncExternalStore` adapters kept rendering the pre-replace state. Revalidation now emits `TRANSITION_SUCCESS`: when the active path still matches it commits the revalidated state and emits; when the active route was dropped it routes through `navigateToNotFound` (commits `UNKNOWN_ROUTE`, emits) instead of silently clearing.

**Behavior change:** after a `replace()` that drops the active route, `getState()` is now `UNKNOWN_ROUTE` (was `undefined`), and plugins' `onTransitionSuccess` fires for a `replace()` revalidation. `clear()` stays a silent structural reset (the asymmetry is intentional — `clear` has no next state for adapters to render; `replace` does).
