---
"@real-router/vue": minor
---

Audit-driven hardening of @real-router/vue (#462)

- **Nested `<RouterProvider>`:** the `v-link` directive now uses a router stack (LIFO) instead of a single `_router` global. Inner providers push on mount and release on unmount, restoring the outer router for `v-link` instances still mounted in the parent scope. Previously, nested providers left the directive pointing at a torn-down router. New `pushDirectiveRouter(router): () => void` is the preferred API; `setDirectiveRouter(...)` is kept for tests and replaces the top of the stack
- **`<RouterProvider>` `announceNavigation`:** now reactive. Toggling the prop at runtime creates/destroys the announcer accordingly. Previously the prop was read only inside `onMounted`, so post-mount toggles silently no-op'd
- **`<Link>`:** set `inheritAttrs: false` and manually invoke `attrs.onClick` inside `handleClick`. Vue's compiled templates pass multiple `@click` handlers as an *array*; the previous implementation only invoked function values and silently dropped array cases, leading to double-invocation when attrs fall-through combined with the explicit `onClick`. Arrays are iterated and the loop exits early on `preventDefault()`
- **`<Link>`:** `isActive` now drives a local `shallowRef` backed by `createActiveRouteSource` with `flush: "sync"`. Resubscription happens only when `routeName` / `routeParams` / `activeStrict` / `ignoreQueryParams` actually change — the prior `useIsActiveRoute` composable resubscribed on any reactive read inside the source factory
- **`v-link` directive:** validates the binding value before attaching handlers. Missing `value` or missing `name: string` logs a descriptive error and skips wiring — prevents crashes inside click/keydown handlers. Single `handlers` WeakMap replaces two parallel click/keydown maps
- **`<RouteView>`:** cache per-Match `keepAlive` detection by slot output identity. Steady-state navigations skip the O(n) `elements.some(...)` scan when the parent has not re-rendered the default slot
- **`useRouteNode`:** derive `route`/`previousRoute` as `computed` over the source snapshot instead of mirroring through two `shallowRef`s with a sync `watch`. Consumers now see a stable reference when the underlying source emits the same snapshot (idempotent or out-of-node navigation)
- **`RouteContext` types:** `route` / `previousRoute` are now typed as `Readonly<Ref<State | undefined>>` instead of `ShallowRef<State | undefined>`. `useRoute` still returns `shallowRef`-backed values, while `useRouteNode` returns `computed`-derived ones — both satisfy the new `Readonly<Ref>` contract. Consumers that only read `.value` are unaffected
- **Shared `setupRouteProvision`:** extracted between `RouterProvider` and `createRouterPlugin` so both paths share identical subscription lifecycle. `createRouterPlugin` now cleans up via Vue 3.5's `app.onUnmount` when available (falls back to GC on older 3.3–3.4)
- **Stress coverage:** expanded suites for keepalive cycling, link mass rendering, mount/unmount lifecycle, subscription fan-out, `shouldUpdate` cache, transition-hook stress, v-link directive stress

No runtime behavior change for the documented public API aside from the nested-provider fix and the `announceNavigation` reactivity fix.
