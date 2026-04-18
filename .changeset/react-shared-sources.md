---
"@real-router/react": patch
---

fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source (#467)

Migrated internal hooks to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — multiple consumers now share one router subscription per router instance instead of creating fresh WeakMap caches locally. Removed duplicated `useStableValue` helper (params stabilization is now canonical inside `createActiveRouteSource`).
