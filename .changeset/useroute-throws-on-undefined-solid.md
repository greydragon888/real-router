---
"@real-router/solid": minor
---

Narrow `useRoute()` accessor return so `route` is non-nullable; throw a clear error when the router has no active state (#535)

`useRoute()` now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before `router.start()` resolves. The accessor return type narrows so `state().route.name` is direct — no `?.`, no `<Show when={state().route}>` wrapper. `useRouteNode(name)` and `useRouteStore()` are unchanged — node-scoped nullability is intentional.
