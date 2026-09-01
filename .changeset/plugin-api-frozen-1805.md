---
"@real-router/core": minor
---

`getPluginApi(router)` hands back a frozen surface (#1805)

One object per router is cached and handed to every consumer — nineteen units
across this repository alone — so a single `api.addInterceptor = …`, the shape an
"instrument everything" line takes, rewired the surface for all of them silently,
with nothing for the next consumer to notice.

`getRoutesApi` and `getNavigator` were already frozen for the same reason; this
closes the last cached-and-mutating factory. The two uncached ones
(`getLifecycleApi`, `getDependenciesApi`) need nothing — a write to a per-call
object cannot reach a second consumer.

**Migration for a test that stubs the surface.** Spy one layer down, on
`getInternals(router)` from `@real-router/core/validation` — a spy there intercepts
a call made through this surface. ⚠ `buildNavigationState` has no counterpart there
and composes its state locally, so it is the one member this migration does not
cover; nothing stubs it today.
Measured across the repository — seventeen sites in three packages moved with no
change in what they assert.
