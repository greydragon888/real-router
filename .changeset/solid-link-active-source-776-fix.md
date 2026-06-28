---
"@real-router/solid": patch
---

Stop splitting the active-route source cache key on the slow-path `<Link>` (#776)

The `<Link>` slow path (taken for custom `activeStrict` / `ignoreQueryParams` / `hash`) now passes the raw `routeParams` (possibly `undefined`) into `createActiveRouteSource` instead of the merged `EMPTY_PARAMS` (`{}`) default. A no-params slow-path Link therefore shares ONE cached source with a manual `createActiveRouteSource(router, name, undefined)` (key `""`) instead of keying `"{}"`. The `routeSelector` fast path and navigation/href behaviour are unchanged.
