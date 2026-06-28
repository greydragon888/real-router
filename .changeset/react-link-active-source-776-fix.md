---
"@real-router/react": patch
---

Stop splitting the active-route source cache key for a no-params `<Link>` / `<InkLink>` (#776)

`<Link>` and `<InkLink>` no longer default `routeParams` to `EMPTY_PARAMS` (`{}`) before calling the active-route source. `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<Link routeName="x">` and a manual `useIsActiveRoute("x")` now resolve the SAME cached source — one router subscription, not two distinct entries (`"{}"` vs `""`). Navigation and href building still default to `EMPTY_PARAMS` locally where a concrete object is required; active-state, href and navigation behaviour are unchanged.
