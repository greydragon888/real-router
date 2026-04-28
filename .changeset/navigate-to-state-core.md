---
"@real-router/core": minor
"@real-router/types": minor
"@real-router/validation-plugin": minor
---

Add `router.navigateToState(state, opts)` for plugin-driven navigation (#525)

New navigation primitive that takes a fully-built `State` (typically from
`getPluginApi(router).matchPath(url)`) and skips the redundant
`forwardState`+`buildPath` re-application that `router.navigate(name, params)`
runs inside `buildNavigateState`. The committed `state.path` is the matched
path verbatim, fixing the `trailingSlash:"preserve"` divergence where the
URL bar said `/users/` but `state.path` got canonicalized to `/users`
(#525, Q2).

- Public on `Router` and `Navigator`.
- `@real-router/validation-plugin` adds `validateNavigateToStateArgs` for
  structural state-shape validation.
- `forwardState` and `buildPath` interceptors do NOT run on this path —
  matchPath already applied `forwardState`, and the URL the user navigated
  to is the source of truth (no buildPath rewrite). For programmatic
  navigation that must apply interceptors (e.g. `persistent-params-plugin`
  injecting query params), continue to use `router.navigate(name, params)`.

Benchmark on the `popstate-roundtrip.bench.ts` fixtures (Apple silicon,
Node 24): `navigateToState` is **0.13–0.83 µs faster per call** than the
old `router.navigate(matched.name, matched.params)` round-trip across
flat / nested-4 / search-params / forwardTo / defaultParams /
trailingSlash:"preserve" fixtures (5–20% reduction).
