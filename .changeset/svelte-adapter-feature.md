---
"@real-router/svelte": minor
---

Add `@real-router/svelte` — Svelte 5 integration for Real-Router (#292)

New package providing Svelte 5 bindings with composables and components:

- `RouterProvider`, `Link`, `RouteView` components with snippets support
- `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` composables
- `createReactiveSource` primitive using `createSubscriber` for reactive state
- Pure TypeScript implementation using Svelte 5 runes
- Automatic cleanup via Svelte's lifecycle
- Single entry point
