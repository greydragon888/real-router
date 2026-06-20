---
"@real-router/core": patch
---

Fix `canNavigateTo()` throwing instead of returning a boolean on missing required params (#725)

`router.canNavigateTo(name, params?)` is typed as a `boolean` predicate but threw a raw `Error` from `SegmentMatcher.buildPath` when the target route had required path params that were not supplied (e.g. `canNavigateTo("user", {})` for `"/u/:id"`). Building the target state is now guarded: if the path can't be built from the given params, the route is unreachable with that input and the predicate returns `false` instead of throwing. Complete params behave exactly as before (the guards decide the result).
