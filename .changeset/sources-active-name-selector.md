---
"@real-router/sources": minor
---

feat: add `createActiveNameSelector(router)` — per-router cached O(1) active-name checker

One shared `router.subscribe` handle across any number of distinct route-name consumers (vs one subscription per name via `createActiveRouteSource`). Framework adapters can adopt this for `Link` fast-paths when params/strict/ignoreQueryParams are at defaults. Based on the `routeSelector` pattern from `@real-router/solid`, now available framework-agnostic.

API: `{ subscribe(routeName, listener), isActive(routeName), destroy }`. New `ActiveNameSelector` type exported.
