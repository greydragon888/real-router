---
"@real-router/react": minor
---

Audit-driven hardening of @real-router/react (#462)

- **Hot path:** cache `createTransitionSource` per router via `WeakMap` — `useRouterTransition` no longer recreates the source on every render/router-ref change
- **Hot path:** cache `RouteUtils` per router via `WeakMap` in `useRouteUtils` — drops repeated `getPluginApi().getTree()` lookups on re-render
- **Hot path:** `RouterProvider` / `useRouteNode` now keep the raw `useSyncExternalStore` snapshot as the memo dependency instead of destructuring `{ route, previousRoute }`. `stabilizeState` guarantees the snapshot identity is preserved across idempotent navigations — consumers no longer re-render when the route did not change
- **Hot path:** `useRouteNode` drops the redundant `useMemo` wrapper around `getNavigator(router)` — `getNavigator` is already WeakMap-cached in core
- **`<RouteView>`:** memoize the flattened `Match`/`NotFound` element list on `children` identity. Steady-state navigations skip the `Children.toArray` + `collectElements` traversal; only re-traverse when the parent re-renders with a new `children` node. `ref` is lazy-initialized to avoid per-render `new Set()` allocation
- **`<RouteView>`:** `isSegmentMatch` now early-returns `false` for empty-string `fullSegmentName` — prevents a literal route named `""` from matching against `activeStrict=false` prefix logic
- **`useStableValue`:** rewritten as a pure `useRef` pattern with order-insensitive recursive JSON serialization via `stableSerialize`. Gracefully falls back to identity (`Object.is`) comparison when serialization throws (BigInt, circular refs, Symbol, function). Previously threw on BigInt and treated key-order permutations as different values
- **Stress coverage:** new suites for dynamic routes, error boundary teardown, Suspense + transition, link-mass-rendering, mount/unmount lifecycle, transition-hook stress
- **Performance tests:** new coverage for `useIsActiveRoute`, `useNavigator`, `useRouteUtils`, `useRouter` to lock in the WeakMap/cache invariants
- **Property tests:** shared `linkUtils.properties.ts` now exercises the real `dom-utils` exports (`shouldNavigate`, `buildActiveClassName`, etc.) instead of inline replicas
- **Docs:** README / ARCHITECTURE / CLAUDE brought back in sync with source — gotcha table updated to reflect the new stable-snapshot behavior

No public API change.
