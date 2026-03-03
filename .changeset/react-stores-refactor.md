---
"@real-router/react": patch
---

Refactor React hooks to use `@real-router/stores` (#217)

Internal refactoring: `useRouteNode`, `useIsActiveRoute`, and `RouterProvider` now delegate
subscription logic to `@real-router/stores`. No public API changes.
