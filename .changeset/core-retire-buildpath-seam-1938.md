---
"@real-router/core": minor
---

The `buildPath` interception point is retired — one seam, above the merge (#1938)

`addInterceptor("buildPath", …)` is gone. `InterceptableMethodMap` and its
runtime twin `SEAM` now carry two names, `start` and `forwardState`, and
`port.buildPath` prints straight through the routes namespace with nothing
interceptable between the port and the engine.

**Why a seam's POSITION was the defect and not its existence.** `buildPath` sat
BELOW the route-default merge, so what a plugin injected there reached the
printed URL and never `state.search` — a state that does not round-trip through
its own path, and an href no click reproduces. `forwardState` sits above the
merge and every door runs it, `router.buildPath` included since #2087, so one
registration now covers what two used to cover unevenly.

**Migration.** TypeScript rejects the string; at runtime `addInterceptor` throws
a `TypeError` naming the method and the set it is not in (#2088) — there is no
silent no-op. Move the interceptor to `forwardState` and write into the channel
you mean:

```ts
api.addInterceptor("forwardState", (next, name, params, search) => {
  const state = next(name, params, search);

  return { ...state, search: { lang: "en", ...state.search } };
});
```

⚠ One behaviour moves with the seam: `PluginApi.makeState(name, params, search)`
called WITHOUT a path used to print through the `buildPath` chain, and now
reaches no seam at all — the two `makeState` rows in
`seam-coverage-authority-1938` agree. Its production caller (`popstate-utils`)
supplies the path and is unaffected.

**Three things collapsed with it, each verified dead rather than assumed.**
`buildURLForCommit` existed only to re-report keys a chain added below the print,
so it folds back into `buildURL`; `createTernaryInterceptable`'s `sanitiseNext`
and `prepareArgs` become required, one seam supplying both; and
`RoutesNamespace.buildPath` takes a REQUIRED `search`, the port being its only
caller. Core keeps 100 % coverage on all four axes.

Two tests were vacuous and are now not: `still allows a navigation from
matchPath's interceptors` registered a seam `matchPath` never ran, so its "no
throw" was a chain that never fired, and the `UNKNOWN_ROUTE` own-key filter lost
its only observer — it is pinned through the public door instead, and a mutation
of the filter reds it.
