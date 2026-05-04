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

## Loader-driven build: typed LoaderNotFound at build time

`src/_loader-errors.ts` defines `LoaderNotFound`. The `users.profile` loader throws it for ids that aren't in the database. `scripts/ssg-build.ts` wraps every `render(url)` call in `try/catch` and pushes failures into a list; if any URL errored, the script exits with a non-zero code.

This guards against a real failure mode: an id remains in `entries.ts` after the corresponding row is deleted from the database. Without the typed error, the loader would resolve `user: undefined`, the build would silently emit a "user not found" page for the stale id, and 404 would be served as a 200 with empty content. With it, the build aborts loudly.

The contract is verified by an e2e test that imports the compiled `entry-server.js` and asserts `render('/users/9999')` rejects with `LoaderNotFound`.

## Production HTTP semantics: Cache-Control + auto-ETag (no AbortController)

The SSG preview layer adds one production-grade piece, and inherits another for free:

- **Per-route `Cache-Control`** — the `ssgServe()` Vite preview plugin in `vite.config.ts` runs `getCachePolicy(url)` for every static request and intercepts `res.writeHead` so the policy survives Vite's own `Cache-Control: no-cache` default. Routes get: `/` → `public, s-maxage=3600, must-revalidate`, `/users/` → `public, max-age=60`, `/users/:id/` → `public, max-age=120`.
- **Weak `ETag`** — Vite preview's static handler attaches a weak ETag derived from file mtime (`W/"<size>-<mtime>"`). Conditional GETs against pre-rendered HTML return `304 Not Modified` for free, no bespoke hashing required.

**`AbortController` is not applicable** — SSG serves pre-rendered files; there is no per-request render to cancel. The runtime SSR example (`../ssr/`) demonstrates `AbortController` for that case.

These are demonstrated end-to-end by 2 dedicated tests in `e2e/ssg.spec.ts` (Cache-Control routing, weak-ETag conditional GET).

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
