# SSG Vue Example

Static site generation with Real-Router, Vue 3, and Vite — the Vue port of the React `ssg/` example.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `renderToString()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **Per-page meta tags** — `meta.ts` derives `<title>` + `<meta description>` from resolved router state
- **404.html fallback + sitemap.xml** — generated as part of the build
- **XSS-safe state serialization** via `serializeRouterState()` — data embedded in static HTML
- **Client hydration** — auto-detects SSG content vs dev mode (`createSSRApp` vs `createApp`)
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
scripts/
  ssg-build.ts        Build script: reads template → getStaticPaths → render → write HTML
src/
  entry-server.ts     render(url) + getStaticPaths() exports
  entry-client.ts     hydrate (SSG) or mount fresh (dev) detection
  App.vue             Shared component tree
  router/
    routes.ts         Route definitions (home, users, users.profile)
    loaders.ts        Per-route data loaders
    entries.ts        Parameter sets for dynamic routes (users.profile → id: 1, 2, 3)
    meta.ts           Per-route meta tag resolver
    createAppRouter.ts  Router factory
  pages/
    Home, UsersList, UserProfile, NotFound (.vue)
```

## SSG Flow

```
Build time:
  getStaticPaths(router, entries)
    → walks route tree → finds leaf routes
    → static routes: buildPath(name, {})
    → dynamic routes: entries[name]() → buildPath(name, params) for each
    → returns ["/", "/users/1", "/users/2", "/users/3"] (leaf-only — UsersList added manually)

  For each URL:
    cloneRouter(base)
      → usePlugin(ssrDataPluginFactory(loaders))
      → start(url) → renderToString(createSSRApp(...)) → serializeRouterState()
      → write dist/{url}/index.html

Client (once):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)
    → createSSRApp(...).mount("#root")  // SSR content present
       OR createApp(...).mount("#root") // dev mode (no SSR content)
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
  404.html                ← not-found fallback
  sitemap.xml             ← all pre-rendered URLs
  assets/
    index-*.js            ← client bundle (shared across all pages)
```

## Running

```bash
pnpm dev          # Vite dev server (client-side only, no SSG)
pnpm build:app    # vite build → SSR build → SSG script
pnpm preview      # Serve pre-rendered static files
pnpm test:e2e     # Playwright tests
```

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `getStaticPaths()`, `serializeRouterState()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/vue` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync after hydration

## See Also

- [`examples/web/react/ssr-examples/ssg/`](../../../react/ssr-examples/ssg) — React 19 counterpart
