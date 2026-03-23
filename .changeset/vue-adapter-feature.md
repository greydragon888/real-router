---
"@real-router/vue": minor
---

Add `@real-router/vue` — Vue 3 integration for Real-Router (#291)

New package providing Vue 3 bindings with composables and components:

- `RouterProvider`, `Link`, `RouteView` components with `keepAlive` support
- `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` composables
- Pure TypeScript implementation using `defineComponent` and `h()`
- Automatic cleanup via Vue's lifecycle hooks
- Single entry point
