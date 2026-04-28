---
"@real-router/preact": minor
---

Narrow `useRoute()` return type so `route` is non-nullable; throw a clear error when the router has no active state (#535)

`useRoute()` now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before `router.start()` resolves (or after stop/dispose). The return type narrows so consumers can read `route.params.id` directly without `route?.` defenses. `useRouteNode(name)` is unchanged.
