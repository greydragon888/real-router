# SSG Preact Example

Static site generation with Real-Router, Preact 10, and Vite.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` from `@real-router/core/utils` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `renderToString()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **Per-route meta** — title + description + canonical (absolute URL, per-id) + OpenGraph block spliced into HTML head
- **`LoaderNotFound` at build time** → fail loudly (build aborts with non-zero exit code)
- **Auto-detection of SSG content vs dev mode** — entry-client uses `hydrate()` when content exists, `render()` otherwise
- **Client-side navigation** after hydration via `@real-router/browser-plugin`
- **`404.html` + `sitemap.xml`** generated alongside the static files

## Architecture

```
scripts/
  ssg-build.ts        Build script: reads template → getStaticPaths → render → write HTML
src/
  database.ts         In-memory mock store
  entry-server.tsx    render(url) + getStaticPaths() exports
  entry-client.tsx    Preact hydrate() (SSG) or render() (dev) detection
  App.tsx             Shared component tree
  router/
    routes.ts         Route definitions (home, users, users.profile, users.profile.posts)
    loaders.ts        Per-route data loaders (typed errors via ssr-data-plugin/errors)
    entries.ts        Parameter sets for dynamic routes (users.profile → id: 1, 2, 3)
    meta.ts           Per-route PageMeta resolver (canonical, og)
    createAppRouter.ts  Router factory
  pages/
    Home.tsx, UsersList.tsx, UserProfile.tsx, UserPosts.tsx, NotFound.tsx
vite.config.ts        Vite + @preact/preset-vite + ssgServe (preview-time Cache-Control)
```

## SSG Flow

```
Build time:
  getStaticPaths(router, entries)
    → walks route tree → finds leaf routes
    → static routes: buildPath(name, {})
    → dynamic routes: entries[name]() → buildPath(name, params) for each
    → returns ["/", "/users/1/posts", "/users/2/posts", "/users/3/posts"]

  ssg-build.ts:
    → derives intermediate /users/<id> paths from leaves
    → adds /users (parent UsersList)
    → final list: 8 URLs

  For each URL:
    cloneRouter(base)
      → usePlugin(ssrDataPluginFactory(loaders))
      → start(url) → renderToString() → serializeRouterState()
      → write dist/<url>/index.html (or dist/index.html for /)

  Then:
    → render("/__nonexistent") → write dist/404.html
    → emit dist/sitemap.xml

Client (once per page load):
  createAppRouter()
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__) (SSG path)
       OR router.start(window.location.pathname) (dev fallback)
    → if rootElement.firstElementChild → hydrate(); else → render()
```

## Output

```
dist/
  index.html              ← /
  404.html                ← not-found template
  sitemap.xml
  users/
    index.html            ← /users
    1/index.html          ← /users/1
    1/posts/index.html    ← /users/1/posts
    2/index.html
    2/posts/index.html
    3/index.html
    3/posts/index.html
  assets/
    index-*.js            ← client bundle (shared across all pages)
```

## Running

```bash
pnpm dev          # Vite dev server (client-side only, no SSG)
pnpm build:app    # vite build → SSR build → SSG script
pnpm preview      # Serve pre-rendered static files (with per-route Cache-Control)
pnpm test:e2e     # Playwright tests
```

## Loader-driven build: `LoaderNotFound` aborts the build

`@real-router/ssr-data-plugin/errors` exports `LoaderNotFound`. The `users.profile` loader throws it for ids absent from the database. `scripts/ssg-build.ts` catches typed errors per URL, collects failures, and exits with a non-zero code if any URL errored.

This guards against a real failure mode: an id remains in `entries.ts` after the corresponding row is deleted from the database. Without the typed error, the loader would resolve `user: undefined`, the build would silently emit a "user not found" page for the stale id, and 404 would be served as a 200 with empty content.

The contract is verified by an e2e test that imports the compiled `dist/server/entry-server.js` and asserts `render('/users/9999')` rejects with the typed `LoaderNotFound` error (`code === "LOADER_NOT_FOUND"`, `resource === "user:9999"`).

## Per-route Cache-Control at preview time

The `ssgServe()` Vite plugin in `vite.config.ts` runs `getCachePolicy(url)` for every static request and intercepts `res.writeHead` so the policy survives Vite's own `Cache-Control: no-cache` default. Vite preview's static handler attaches a weak ETag from file mtime — conditional GETs return `304 Not Modified` for free.

## Differences from `react/ssr-examples/ssg/`

- **Renderer**: `preact-render-to-string@6.6.7` `renderToString` instead of `react-dom/server`.
- **Hydration**: `hydrate(vnode, parent)` from `preact` (parameter order reversed vs React); fresh-render path uses `render(vnode, parent)` from `preact` instead of React's `createRoot`.
- **Vite plugin**: `@preact/preset-vite`. JSX import source set to `preact`.

## Required: `resolve.dedupe` for Preact

`vite.config.ts` pins `resolve.dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"]` — required to avoid two-copies-of-preact in the bundle. See [`../ssr/README.md`](../ssr/README.md#required-resolvededupe-for-preact-in-monorepo-vite-configs) for the full explanation; same fix lands in all three SSR examples.

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `getStaticPaths()`, `serializeRouterState()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/ssr-data-plugin/errors` — typed loader errors
- `@real-router/preact` — `RouterProvider`, `RouteView`, `Link`, hooks
- `@real-router/browser-plugin` — client-side URL sync after hydration
