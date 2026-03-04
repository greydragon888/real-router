---
"@real-router/react": patch
---

Refactor React hooks to use `@real-router/sources` (#217)

Internal refactoring: `useRouteNode`, `useIsActiveRoute`, and `RouterProvider` now delegate
subscription logic to `@real-router/sources`. No public API changes.
