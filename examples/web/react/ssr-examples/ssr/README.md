# SSR React Example

Server-side rendering with Real-Router, React 19, Express, and Vite.

## What This Demonstrates

- **Per-request router cloning** via `cloneRouter()` — each request gets an isolated router instance
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route-specific loaders run during `start(url)` and write to `state.context.data`
- **State serialization** via `serializeRouterState()` (XSS-safe) — full router state embedded in HTML `<script>` tag
- **Client hydration** — `hydrateRouter(router, __SSR_STATE__)` re-resolves router state by `state.path`; `hydrateRoot()` reuses server-rendered DOM without mismatch
- **Auth-gated routes** — dashboard page protected by `canActivate` guard with server-side dependency injection
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation; `ssr-data-plugin` is registered on the client too so subsequent navigations re-run loaders

## Architecture

```
server/
  dev.ts              Express + Vite dev middleware (HMR)
  index.ts            Express production server (serves built assets)
src/
  database.ts         In-memory mock store (single source of truth for users)
  entry-server.tsx    render(url, context) → { html, serializedData, statusCode, redirect }
  entry-client.tsx    hydrateRouter() + hydrateRoot() with browser-plugin + ssr-data-plugin
  App.tsx             Shared component tree (server + client)
  router/
    routes.ts         Route definitions with auth guard
    loaders.ts        Per-route data loaders (consume database, write to state.context.data)
    createAppRouter.ts  Router factory with dependency injection
  pages/
    Home.tsx, UsersList.tsx, UserProfile.tsx, Dashboard.tsx, NotFound.tsx
```

## SSR Flow

```
Server (per request):
  cloneRouter(base, { isAuthenticated })
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)
      → route matched → guards run → loader runs → state.context.data populated
    → renderToString(<RouterProvider><App /></RouterProvider>)
      → pages read state.context.data via useRoute()
    → serializeRouterState(state) → embed in HTML as window.__SSR_STATE__
    → dispose()

Client (once):
  createAppRouter({ isAuthenticated })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)
      → reads state.path, calls router.start(path) → loader re-runs → state.context.data restored
    → hydrateRoot(<RouterProvider><App /></RouterProvider>)
```

The client-side `ssrDataPluginFactory` registration is intentional: after hydration, every subsequent client navigation re-runs the loader so `state.context.data` is always populated. SSR-only intercept means the loader fires only on `start(url)`, not on every `navigate()` — but `hydrateRouter` invokes `start` once at hydration time.

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
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync
