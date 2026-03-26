# SSR React Example

Server-side rendering with Real-Router, React 19, Express, and Vite.

## What This Demonstrates

- **Per-request router cloning** via `cloneRouter()` — each request gets an isolated router instance
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route-specific loaders run during `start(url)`
- **XSS-safe state serialization** via `serializeState()` — data embedded in HTML `<script>` tags
- **Client hydration** — `hydrateRoot()` reuses server-rendered DOM without mismatch
- **Auth-gated routes** — dashboard page protected by `canActivate` guard with server-side dependency injection
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
server/
  dev.ts              Express + Vite dev middleware (HMR)
  index.ts            Express production server (serves built assets)
src/
  entry-server.tsx    render(url, context) → { html, serializedData, redirect }
  entry-client.tsx    hydrateRoot() with browser-plugin
  App.tsx             Shared component tree (server + client)
  router/
    routes.ts         Route definitions with auth guard
    loaders.ts        Per-route data loaders (SSR-only)
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
      → route matched → guards run → state resolved → data loaded
    → renderToString(<RouterProvider><App /></RouterProvider>)
    → serializeState(data) → embed in HTML
    → dispose()

Client (once):
  createAppRouter({ isAuthenticated })
    → usePlugin(browserPluginFactory())
    → start()  ← browser-plugin injects window.location
    → hydrateRoot(<RouterProvider><App /></RouterProvider>)
```

## Running

```bash
pnpm dev          # Dev server with HMR (Express + Vite middleware)
pnpm build:app    # Build client + server bundles
pnpm preview      # Production server
pnpm test:e2e     # Playwright tests
```

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `serializeState()`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, hooks
- `@real-router/browser-plugin` — client-side URL sync
