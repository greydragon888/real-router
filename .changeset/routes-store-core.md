---
"@real-router/core": minor
---

Introduce `RoutesStore`, consolidate clone internals and reduce `RouterInternals` surface (#180)

**Breaking Change:** `RouterInternals` route-related entries replaced with single `routeGetStore()` accessor. Plugins using `getInternals()` must migrate.

**What changed:**

- New `RoutesStore<D>` interface — plain data object holding all route state (~13 fields previously spread across `RoutesNamespace` private properties)
- `RoutesNamespace` now owns a single `#store: RoutesStore` instead of ~13 private fields and ~11 accessor methods
- `RouterInternals` reduced from ~20 individual `route*` entries to one `routeGetStore()` — eliminates `RoutesDataContext` assembly boilerplate
- `RouterInternals<D>` is now generic — removes `as unknown as` type casts in `cloneRouter`, `getRoutesApi`, `getDependenciesApi`
- `cloneRouter()` operates directly on `RoutesStore` — removes `applyClonedConfig()`, `cloneRoutes()`, and related accessor methods
- `getRoutesApi()` passes store directly instead of assembling `RoutesDataContext` per call

**Migration (plugins using `getInternals()`):**

```diff
  const ctx = getInternals(router);
- const tree = ctx.routeGetTree();
- const definitions = ctx.routeDefinitions;
- const config = ctx.routeConfig;
- const matcher = ctx.routeGetMatcher();
+ const store = ctx.routeGetStore();
+ const tree = store.tree;
+ const definitions = store.definitions;
+ const config = store.config;
+ const matcher = store.matcher;
```
