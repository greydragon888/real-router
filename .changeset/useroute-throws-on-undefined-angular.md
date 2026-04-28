---
"@real-router/angular": minor
---

Narrow `injectRoute()` signal return so `routeState().route` is non-nullable; throw a clear error when the router has no active state (#535)

`injectRoute()` now throws `"injectRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when called before `router.start()` resolves. The `routeState` signal narrows to `Signal<{ route: State<P>; previousRoute?: State }>` — templates use `routeState().route.name` directly. `injectRouteNode(name)` is unchanged.
