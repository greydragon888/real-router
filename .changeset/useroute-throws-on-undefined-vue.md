---
"@real-router/vue": minor
---

Narrow `useRoute()` ref return so `route.value` is non-nullable; throw a clear error when the router has no active state (#535)

`useRoute()` now throws `"useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?"` when invoked before `router.start()` resolves. `route` is typed as `Readonly<Ref<State<P>>>` (non-nullable inner value) so `route.value.params.id` is direct in scripts, `{{ route.params.id }}` in templates. `useRouteNode(name)` is unchanged.
