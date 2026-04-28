---
"@real-router/core": minor
---

Add plugin-only `getPluginApi(router).navigateToState(state, opts)` (#525)

New navigation primitive on `PluginApi`: takes a fully-built `State`
(typically from `getPluginApi(router).matchPath(url)`) and skips the
redundant `forwardState`+`buildPath` round-trip that
`router.navigate(name, params)` runs inside `buildNavigateState`. The
committed `state.path` is the matched path verbatim, fixing the
`trailingSlash:"preserve"` divergence where the URL bar said `/users/`
but `state.path` got canonicalized to `/users` (#525, Q2).

- Plugin-only — NOT exposed on the public `Router` or `Navigator`
  interfaces. Plugin internal hot path, deliberately hidden from userland
  autocomplete.
- `forwardState` and `buildPath` interceptors do NOT run on this path —
  matchPath already applied `forwardState`, and the URL the user
  navigated to is the source of truth (no buildPath rewrite). For
  programmatic navigation that must apply interceptors (e.g.
  `persistent-params-plugin` injecting query params), use
  `router.navigate(name, params)` as before.
- `getPluginApi(router)` is now WeakMap-cached per router (mirrors
  `getNavigator`) so `vi.spyOn(getPluginApi(router), "navigateToState")`
  attaches to the same object the plugin instance holds. Avoids repeated
  closure-bag allocations.
- `start(path)` migrated to commit `matchPath(path)` via the new
  primitive, sharing the same code path as URL plugin popstate handlers.

Benchmark on the `popstate-roundtrip.bench.ts` fixtures (Apple silicon,
Node 24): `api.navigateToState` is **0.13–0.83 µs faster per call** than
the old `router.navigate(matched.name, matched.params)` round-trip across
flat / nested-4 / search-params / forwardTo / defaultParams /
trailingSlash:"preserve" fixtures (5–20% reduction).
