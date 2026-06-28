---
"@real-router/sources": patch
---

fix(sources): reconcile lazy sources on reconnect — missed navigations/errors are caught up on re-subscribe (#765)

`createRouteSource` now reconciles its snapshot with the current router state on first subscribe — previously only `createRouteNodeSource` did — so a navigation that lands while the source has **zero subscribers** (a `RouterProvider` under a React `<Activity>` hide→navigate→show cycle, or all `.current` readers gated behind a Svelte `{#if}`) is caught up on re-subscribe instead of replaying a stale route. The reconcile fires only when the route actually changed (no spurious re-render on a no-nav hide/show); `previousRoute` resets to `undefined` on catch-up, since the real previous route can't be reconstructed outside a live subscribe payload. `createDismissableError` likewise catches up on first subscribe, so a `RouterErrorBoundary` mounting after a boot-time navigation error now observes it.
