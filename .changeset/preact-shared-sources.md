---
"@real-router/preact": patch
---

fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source (#467)

Migrated internal hooks to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — `useRouterTransition` previously created a fresh eager-source per mount (no WeakMap cache), leaking a router subscription on every unmount. Also removed duplicated `useStableValue` helper — params stabilization is now canonical inside `createActiveRouteSource`.
