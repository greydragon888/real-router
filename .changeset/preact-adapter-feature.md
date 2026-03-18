---
"@real-router/preact": minor
---

Add `@real-router/preact` — Preact integration for Real-Router (#289)

New package providing Preact bindings with the same API as `@real-router/react`:

- `RouterProvider`, `Link`, `RouteView` components
- `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` hooks
- Custom `useSyncExternalStore` polyfill (Preact has no native implementation)
- No `keepAlive` support (Preact has no `Activity` API)
- Single entry point (no legacy split)
