---
"@real-router/vue": patch
---

fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source

Migrated internal composables to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — `useRouterTransition` previously created a fresh eager-source per mount (no WeakMap cache), leaking a router subscription on every unmount. Multiple consumers now share one router subscription.
