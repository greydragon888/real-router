---
"@real-router/solid": patch
---

fix: unified node/active source caches moved to `@real-router/sources`

- Migrated `useRouterError`/`useRouterTransition` to `getErrorSource` / `getTransitionSource` — removed local WeakMap caches.
- Removed local `sharedNodeSource` helper — `createRouteNodeSource` in `@real-router/sources` now caches per `(router, nodeName)` natively.
- Removed `Link` slow-path `activeSourceCache` + `getOrCreateActiveSource` — `createActiveRouteSource` now caches per `(router, name, params, options)` natively.
