# SSG React Example

Static site generation with Real-Router, React 19, and Vite.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `renderToString()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **XSS-safe state serialization** via `serializeState()` — data embedded in static HTML
- **Client hydration** — auto-detects SSG content vs dev mode (hydrate vs fresh render)
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
scripts/
  ssg-build.ts        Build script: reads template → getStaticPaths → render → write HTML
src/
  entry-server.tsx    render(url) + getStaticPaths() exports
  entry-client.tsx    hydrate (SSG) or createRoot (dev) detection
  App.tsx             Shared component tree
  router/
    routes.ts         Route definitions (home, users.list, users.profile)
    loaders.ts        Per-route data loaders
    entries.ts        Parameter sets for dynamic routes (users.profile → id: 1, 2, 3)
    createAppRouter.ts  Router factory
  pages/
    Home.tsx, UsersList.tsx, UserProfile.tsx, NotFound.tsx
```

## SSG Flow

```
Build time:
  getStaticPaths(router, entries)
    → walks route tree → finds leaf routes
    → static routes: buildPath(name, {})
    → dynamic routes: entries[name]() → buildPath(name, params) for each
    → returns ["/", "/users", "/users/1", "/users/2", "/users/3"]

  For each URL:
    cloneRouter(base)
      → usePlugin(ssrDataPluginFactory(loaders))
      → start(url) → renderToString() → serializeState()
      → write dist/{url}/index.html

Client (once):
  createAppRouter()
    → usePlugin(browserPluginFactory())
    → start()
    → hydrateRoot() or createRoot().render()
```

## Output

```
dist/
  index.html              ← /
  users/
    index.html            ← /users
    1/index.html          ← /users/1
    2/index.html          ← /users/2
    3/index.html          ← /users/3
  assets/
    index-*.js            ← client bundle (shared across all pages)
```

## Running

```bash
pnpm dev          # Vite dev server (client-side only, no SSG)
pnpm build:app    # vite build → SSR build → SSG script
pnpm preview      # Serve pre-rendered static files
pnpm test:e2e     # Playwright tests (5 specs)
```

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `getStaticPaths()`, `serializeState()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, hooks
- `@real-router/browser-plugin` — client-side URL sync after hydration
