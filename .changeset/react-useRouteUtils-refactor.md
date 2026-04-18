---
"@real-router/react": patch
---

refactor: remove redundant `routeUtilsCache` WeakMap in `useRouteUtils` (#467)

`getRouteUtils` from `@real-router/route-utils` is already WeakMap-cached
per `RouteTreeNode`, so the extra per-router cache in the React adapter
was redundant — the same `RouteUtils` instance is returned across renders
by the internal cache. Aligns React with the 5 other adapters (Preact,
Solid, Vue, Svelte, Angular) that rely on the shared cache directly.
