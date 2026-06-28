---
"@real-router/preact": patch
---

Stop splitting the active-route source cache key for a no-params `<Link>` (#776)

`<Link>` no longer defaults `routeParams` to `EMPTY_PARAMS` (`{}`) before calling the active-route source. `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<Link routeName="x">` and a manual `useIsActiveRoute("x")` now share ONE cached source (one router subscription) instead of splitting into two entries (`"{}"` vs `""`). Active-state, href and navigation behaviour are unchanged.
