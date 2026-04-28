---
"@real-router/svelte": minor
---

Narrow `useRoute()` getter return so `route.current` is non-nullable; throw a clear error when the router has no active state (#535)

`useRoute()` now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before `router.start()` resolves. The getter type narrows so `route.current.name` is direct — no `?.`, no `{#if route.current}` wrapper. `useRouteNode(name)` is unchanged.
