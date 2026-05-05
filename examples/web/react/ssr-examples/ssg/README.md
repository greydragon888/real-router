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
    routes.ts         Route definitions (home, users, users.profile)
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

## Nested SSG + canonical/og + filesystem assertions

Round Z extends the SSG demo to match the other adapters' coverage:

- **Nested route pre-rendering** — `users.profile.posts` is a leaf route; `entries.ts` emits one URL per id for both `users.profile` and `users.profile.posts`. `getStaticPaths()` returns `/users/<id>/posts` (the leaves); `ssg-build.ts` derives the `/users/<id>` profile paths from those leaves and adds `/users` manually. Result: 8 pre-rendered URLs (1 home + 1 list + 3 profiles + 3 posts).
- **Empty-state path** — Charlie has no posts. `/users/3/posts/index.html` ships the `data-testid="user-posts-empty"` UI rather than skipping the page.
- **canonical + OpenGraph meta** — `meta.ts` emits absolute canonical URLs (per-id, NOT the parent `/users` URL) plus `og:title` / `og:description` / `og:url`. `ssg-build.ts`'s `renderMetaBlock()` writes a 6-tag block into `<!--ssr-meta-->` (title, description, canonical, og:title, og:description, og:url).
- **Filesystem-layout assertion** — an e2e test walks `dist/` and verifies the EXACT set of HTML files: catches accidental regressions like extra dirs from stale entries, missing dirs from forgotten path additions, or files written outside the expected layout.
- **Overfetch protection** — `dist/users/` contains only directories for ids declared in `entries.ts` (currently `1`, `2`, `3`).
- **sitemap ↔ disk consistency** — every URL in `sitemap.xml` has a matching pre-rendered file. Drift between sitemap and on-disk is worse than failing the build — it ships a broken contract to crawlers.

7 dedicated tests cover this surface.

## Loader-driven build: typed LoaderNotFound at build time

`src/_loader-errors.ts` defines `LoaderNotFound`. The `users.profile` loader throws it for ids that aren't in the database. `scripts/ssg-build.ts` wraps every `render(url)` call in `try/catch` and pushes failures into a list; if any URL errored, the script exits with a non-zero code.

This guards against a real failure mode: an id remains in `entries.ts` after the corresponding row is deleted from the database. Without the typed error, the loader would resolve `user: undefined`, the build would silently emit a "user not found" page for the stale id, and 404 would be served as a 200 with empty content. With it, the build aborts loudly.

The contract is verified by an e2e test that imports the compiled `entry-server.js` and asserts `render('/users/9999')` rejects with `LoaderNotFound`.

## Production HTTP semantics: Cache-Control + auto-ETag (no AbortController)

The SSG preview layer adds one production-grade piece, and inherits another for free:

- **Per-route `Cache-Control`** — the `ssgServe()` Vite preview plugin in `vite.config.ts` runs `getCachePolicy(url)` for every static request and intercepts `res.writeHead` so the policy survives Vite's own `Cache-Control: no-cache` default. Routes get: `/` → `public, s-maxage=3600, must-revalidate`, `/users/` → `public, max-age=60`, `/users/:id/` → `public, max-age=120`.
- **Weak `ETag`** — Vite preview's static handler attaches a weak ETag derived from file mtime. Conditional GETs against pre-rendered HTML return `304 Not Modified` for free.

`AbortController` is not applicable — SSG serves pre-rendered files; there is no per-request render to cancel. The runtime SSR example (`../ssr/`) demonstrates `AbortController` for that case.

Demonstrated by 2 dedicated tests in `e2e/ssg.spec.ts`.

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `getStaticPaths()`, `serializeState()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, hooks
- `@real-router/browser-plugin` — client-side URL sync after hydration
