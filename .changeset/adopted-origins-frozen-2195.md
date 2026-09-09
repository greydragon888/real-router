---
"@real-router/core": patch
---

`getAdoptedOrigins` hands back a frozen record

`RouterInternals.getAdoptedOrigins()` returned `Router`'s `#adoptedOrigins` field itself — the same object on every call, and unfrozen. A single write into it silently and permanently disabled the diagnostic #2148 exists to provide, for that router and for every consumer of it: `DefaultsMutationWatch.watch` skips a slot whose origin is `undefined`, so

```js
getInternals(router).getAdoptedOrigins().defaultParams = undefined;
```

left the watch with nothing to observe. Nothing threw and nothing logged, and because the record is cached the damage lasted the life of the router.

`weakOrigins()` now freezes the record it returns. That is one call on a two-key object, on a path that runs once per router; `AdoptedOrigins` already declares both members `readonly`, so no type moves, and no published surface changes — `RouterInternals` is reached through `getInternals`.

**The record is frozen, not the bags.** The `WeakRef` targets are the application's own `defaultParams` / `defaultSearch`, and freezing those would break the very mutation the diagnostic exists to notice.

The rule is `packages/core/CLAUDE.md`'s **cached ⟹ frozen** (#1805) — "one instance is shared by every consumer of a router and a single member assignment rewires it for all of them".

**It was not the only unfrozen one.** Asked of all 32 `getInternals` members rather than of a shortlist, six hand back a cached object and four of those were unfrozen: `getAdoptedOrigins`, `dependenciesGetStore`, `port` and `routeGetStore`. The last three are live stores core keeps reading, which is exactly what the `internals` carve-out in `handed-out-containers-1957` was written for. This one is not a store — `git grep '#adoptedOrigins'` returns three sites, all in `Router.ts`: the declaration, one write in the constructor, one read in the `registerInternals` closure. `getOptions` and `getTree` are cached and already frozen, and `getCloneState` mints a fresh literal per call, where a freeze would certify nothing.

Closes #2195.
