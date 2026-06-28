---
"@real-router/vue": patch
---

Stop splitting the active-route source cache key for a no-params `<Link>` (#776)

The `<Link>` `routeParams` prop now defaults to `undefined` (not `EMPTY_PARAMS`) before the active-route source call. `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<Link routeName="x">` and a manual `useIsActiveRoute("x")` now share ONE cached source (one router subscription) instead of splitting into two entries (`"{}"` vs `""`). Navigation and href building default to `EMPTY_PARAMS` locally; active-state, href and navigation behaviour are unchanged.
