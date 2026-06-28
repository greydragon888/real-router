---
"@real-router/angular": patch
---

Stop splitting the active-route source cache key for no-params `realLink` / `realLinkActive` (#776)

The `routeParams` input on the `RealLink` and `RealLinkActive` directives now defaults to `undefined` (not `{}`). `@real-router/sources` keys the cache as `params === undefined ? "" : canonicalJson(params)`, so a no-params `<a realLink>` / `[realLinkActive]` and a manual `injectIsActiveRoute(name)` now share ONE cached source (one router subscription) instead of splitting into two entries (`"{}"` vs `""`). Navigation and href building default to a frozen empty-params object locally; active-state, href and navigation behaviour are unchanged.
