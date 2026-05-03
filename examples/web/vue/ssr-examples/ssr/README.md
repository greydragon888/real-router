# SSR Vue Example

Server-side rendering with Real-Router, Vue 3, Express, and Vite — the Vue port of the React `ssr/` example.

## What This Demonstrates

- **Per-request router cloning** via `cloneRouter()` — each request gets an isolated router instance
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route-specific loaders run during `start(url)` and write to `state.context.data`
- **State serialization** via `serializeRouterState()` (XSS-safe) — full router state embedded in HTML `<script>` tag
- **Client hydration** — `hydrateRouter(router, __SSR_STATE__)` re-resolves router state by `state.path`; Vue `createSSRApp(...).mount()` reuses server-rendered DOM without mismatch
- **Cookie-based DI + auth-gated routes** — dashboard and admin protected by `canActivate` guards consuming `getDep("currentUser")`
- **Query params + nested loaders** — `?sort` on `/users`, leaf-route loader for `/users/:id/posts` returns combined parent + child data
- **Loader error → 500 page** — rejected loader bubbles through `router.start()`, server returns deterministic error page
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
server/
  _auth.ts            Cookie parsing → currentUser DI
  dev.ts              Express + Vite dev middleware (HMR)
  index.ts            Express production server (serves built assets)
src/
  database.ts         In-memory mock store
  entry-server.ts     render(url, context) → { html, serializedData, statusCode, redirect }
  entry-client.ts     hydrateRouter() + createSSRApp().mount() with browser-plugin + ssr-data-plugin
  App.vue             Shared component tree (server + client)
  router/
    routes.ts         Route definitions with auth guards
    loaders.ts        Per-route data loaders
    createAppRouter.ts  Router factory with dependency injection
  pages/
    Home, UsersList, UserProfile, UserPosts, Dashboard, Admin, NotFound (.vue)
```

## SSR Flow

```
Server (per request):
  cloneRouter(base, { currentUser })
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)
      → route matched → guards run → loader runs → state.context.data populated
    → renderToString(createSSRApp(<RouterProvider><App /></RouterProvider>))
      → pages read state.context.data via useRoute()
    → serializeRouterState(state) → embed in HTML as window.__SSR_STATE__
    → dispose()

Client (once):
  createAppRouter({ currentUser: getCurrentUserFromDocument() })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)
      → reads state.path, calls router.start(path) → loader re-runs → state.context.data restored
    → createSSRApp(...).mount("#root")
```

The client-side `ssrDataPluginFactory` registration handles **hydration only**: `hydrateRouter(router, ssrState)` calls `router.start(state.path)` once, and the plugin's `start` interceptor re-runs the loader on the client to repopulate `state.context.data`. Post-hydration component tree sees the same data the server rendered — no flash, no mismatch.

**SSR-only by design:** the plugin intercepts `start()`, **not** `navigate()`. After hydration, subsequent `<Link>` clicks do NOT re-run loaders — same contract as the React example.

## Running

```bash
pnpm dev          # Dev server with HMR (Express + Vite middleware)
pnpm build:app    # Build client + server bundles
pnpm preview      # Production server
pnpm test:e2e     # Playwright tests
```

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/vue` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync

## See Also

- [`examples/web/react/ssr-examples/ssr/`](../../../react/ssr-examples/ssr) — React 19 counterpart
