---
"@real-router/core": patch
---

A name no route carries no longer leaves a cache entry behind (#2347)

**A rejected `navigate` used to record the name it rejected.** The query registry caches per route name, and it cached on every miss — including the miss that means *no such route*. So `router.navigate("ghost")` stored an entry under `"ghost"`, and the entry lived until the next tree REBUILD (`add` / `remove` / `clear` / `replace` / `setRootPath`; never `update`). Measured: fifty-one rejected navigations grew the cache from 1 entry to 52, and the key set was whatever the caller passed.

It takes no internal door to reach. The throwing channel guard runs at the TOP of `navigate`, `PluginApi.makeState` and `PluginApi.buildNavigationState` — all three ask the registry through `throwOnMisChanneledKey`, before anything has asked whether the route exists. Plain `@real-router/core`, plain public API:

```ts
const router = createRouter([{ name: "home", path: "/" }]);

await router.start("/");
await router.navigate("ghost").catch(() => undefined);
// before: an entry under "ghost", held until the tree is rebuilt
// now:    nothing
```

⚑ **`navigateToState` never had it, and that is what names the fix.** It is the one channel-guard position that rejects `ROUTE_NOT_FOUND` *above* its registry read, so the absent name never reaches the cache. The other three positions read first — so the repair belongs in the registry, not in any one door.

**The path-slot registry had the same defect through a different door.** The store keeps two caches with one lifecycle, and `urlParamsCache` recorded an absent name too — reached not by a channel guard but by `areStatesEqual`, on its DEFAULT options: it asks for the path-slot names of whatever route both operands claim to be, and both names are the caller's. Fifty-one comparisons of identically-named absent states left fifty-one entries. Fixed in the same pass, since it is one class in one file.

**Two different absent names now answer with the same array.** The subtracted registry built a fresh frozen empty per name; its twin `getPrintedQueryParams` has always shorted an absent name onto one shared frozen empty. The two registries answer the same question about a name nothing carries, and now they answer it identically.

⚠ **The query registry's early return made the guard below it redundant, and the guard was collapsed rather than left standing.** `declaredQueryParams` is a required slot every registration fills, so `getDeclaredQueryParams` answers `undefined` only for a route that does not exist — which means an early return on `undefined` leaves the old `if (declared)` always true. Left in place it costs a dead false arm: `Branches 99.95 % (2233/2234)`, coverage gate red. Collapsed, the suite is 351 files / 5469 tests green at 100 % on all four axes.
