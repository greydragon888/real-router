# SSG React Example

Static site generation with Real-Router, React 19, and Vite.

## What This Demonstrates

- **Static path enumeration** via `getStaticPaths()` — auto-discovers leaf routes from the router tree
- **Dynamic route entries** — `entries` map provides parameter sets for routes with `:id`
- **Build-time pre-rendering** — `cloneRouter()` + `start(url)` + `renderToString()` for each URL
- **Per-route data loading** via `@real-router/ssr-data-plugin` — loaders run at build time
- **XSS-safe state serialization** via `serializeRouterState()` — data embedded in static HTML
- **Client hydration** — auto-detects pre-rendered content via `rootElement.firstElementChild` (hydrate vs fresh render)
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
scripts/
  ssg-build.ts        Build script: reads template → getStaticPaths → render → write HTML
                      + emits dist/404.html (host-platform convention) and dist/sitemap.xml
src/
  database.ts         In-memory mock store (single source of truth for users + posts)
  entry-server.tsx    render(url) + getStaticPaths() exports
  entry-client.tsx    hydrate (SSG) or createRoot (dev) detection
  App.tsx             Shared component tree
  router/
    routes.ts         Route definitions (home, users, users.profile, users.profile.posts)
    loaders.ts        Per-route data loaders (typed errors via @real-router/ssr-data-plugin/errors)
    entries.ts        Parameter sets for dynamic routes (users.profile + users.profile.posts → id: 1, 2, 3)
    meta.ts           Per-route PageMeta resolver (absolute canonical, og:title/description/url)
    createAppRouter.ts  Router factory
  pages/
    Home.tsx, UsersList.tsx, UserProfile.tsx, UserPosts.tsx, NotFound.tsx
vite.config.ts        Vite + ssgServe() preview middleware (per-route Cache-Control,
                      301 trailing-slash redirects, appType: "mpa" so each URL serves
                      its own pre-rendered file instead of SPA-fallback to /index.html)
```

## SSG Flow

```
Build time:
  getStaticPaths(router, entries)
    → walks route tree → finds LEAF routes only
    → static routes: buildPath(name, {})
    → dynamic routes: entries[name]() → buildPath(name, params) for each
    → returns ["/", "/users/1/posts", "/users/2/posts", "/users/3/posts"]
       (users.profile has children, so it is NOT a leaf)

  ssg-build.ts derives intermediate paths from the leaf list:
    → strip "/posts" suffix → ["/users/1", "/users/2", "/users/3"]
    → + manual "/users" (parent UsersList page)
    → final 8 paths to render

  For each URL:
    cloneRouter(base)
      → usePlugin(ssrDataPluginFactory(loaders))
      → start(url) → renderToString() → serializeRouterState()
      → write dist/{url}/index.html

  Then:
    → render("/__nonexistent") → write dist/404.html (no __SSR_STATE__)
    → emit dist/sitemap.xml from the 8 URLs

Client (once):
  createAppRouter()
    → usePlugin(browserPluginFactory())
    → hydrateRouter(router, window.__SSR_STATE__) or router.start()
    → hydrateRoot() or createRoot().render()
       (auto-detect via rootElement.firstElementChild)
```

## Output

```
dist/
  index.html              ← /
  404.html                ← not-found template (no __SSR_STATE__);
                            host platforms (Netlify/Vercel/CF Pages) auto-serve
                            this for unknown paths
  sitemap.xml             ← all 8 pre-rendered URLs with absolute SITE_ORIGIN
  users/
    index.html            ← /users
    1/
      index.html          ← /users/1
      posts/index.html    ← /users/1/posts
    2/
      index.html          ← /users/2
      posts/index.html    ← /users/2/posts
    3/
      index.html          ← /users/3
      posts/index.html    ← /users/3/posts
  assets/
    index-*.js            ← client bundle (shared across all pages)
```

## Running

```bash
pnpm dev                            # Vite dev server (client-side only, no SSG)
                                    # `predev` hook runs `pnpm turbo run bundle --filter=...`
                                    # so workspace deps are rebuilt before vite starts.
SITE_ORIGIN=https://your.site \
  pnpm build:app                    # vite build → SSR build → SSG script
                                    # SITE_ORIGIN env var sets canonical URLs +
                                    # sitemap origins (default: https://example.com).
pnpm preview                        # Serve pre-rendered static files
pnpm test:e2e                       # Playwright tests
```

## Nested SSG + canonical/og + filesystem assertions

Round Z extends the SSG demo to match the other adapters' coverage:

- **Nested route pre-rendering** — `users.profile.posts` is a leaf route; `entries.ts` emits one URL per id for both `users.profile` and `users.profile.posts`. `getStaticPaths()` returns `/users/<id>/posts` (the leaves); `ssg-build.ts` derives the `/users/<id>` profile paths from those leaves and adds `/users` manually. Result: 8 pre-rendered URLs (1 home + 1 list + 3 profiles + 3 posts).
- **Empty-state path** — Charlie has no posts. `/users/3/posts/index.html` ships the `data-testid="user-posts-empty"` UI rather than skipping the page.
- **canonical + OpenGraph meta** — `meta.ts` emits absolute canonical URLs (per-id, NOT the parent `/users` URL) plus `og:title` / `og:description` / `og:url`. `ssg-build.ts`'s `renderMetaBlock()` writes a 6-tag block into `<!--ssr-meta-->` (title, description, canonical, og:title, og:description, og:url).
- **Filesystem-layout assertion** — an e2e test walks `dist/` and verifies the EXACT set of HTML files: catches accidental regressions like extra dirs from stale entries, missing dirs from forgotten path additions, or files written outside the expected layout.
- **Overfetch protection** — `dist/users/` contains only directories for ids declared in `entries.ts` (currently `1`, `2`, `3`).
- **sitemap ↔ disk consistency** — every URL in `sitemap.xml` has a matching pre-rendered file. Drift between sitemap and on-disk is worse than failing the build — it ships a broken contract to crawlers.

Multiple dedicated tests in `e2e/ssg.spec.ts` cover this surface (nested routes, empty state, canonical/og, filesystem layout, overfetch protection, sitemap ↔ disk).

## Loader-driven build: typed LoaderNotFound at build time

Typed loader errors live in `@real-router/ssr-data-plugin/errors` (hoisted from per-example `_loader-errors.ts` files in commit `e7ad413e`). `loaders.ts` imports `LoaderNotFound` from the package; the `users.profile` and `users.profile.posts` loaders throw it for ids that aren't in the database. `scripts/ssg-build.ts` wraps every `render(url)` call in `try/catch` and pushes failures into a list; if any URL errored, the script exits with a non-zero code.

This guards against a real failure mode: an id remains in `entries.ts` after the corresponding row is deleted from the database. Without the typed error, the loader would resolve `user: undefined`, the build would silently emit a "user not found" page for the stale id, and 404 would be served as a 200 with empty content. With it, the build aborts loudly.

The contract is verified by an e2e test that imports the compiled `entry-server.js` and asserts `render('/users/9999')` rejects with `LoaderNotFound`.

## Production HTTP semantics: Cache-Control + auto-ETag (no AbortController)

The SSG preview layer adds one production-grade piece, and inherits another for free:

- **Per-route `Cache-Control`** — the `ssgServe()` Vite preview plugin in `vite.config.ts` runs `getCachePolicy(url)` for every static request and intercepts `res.writeHead` so the policy survives Vite's own `Cache-Control: no-cache` default. Routes get: `/` → `public, max-age=300, s-maxage=3600, must-revalidate`, `/users/` → `public, max-age=60, must-revalidate`, `/users/:id/` → `public, max-age=120, must-revalidate`.
- **Weak `ETag`** — Vite preview's static handler attaches a weak ETag derived from file mtime. Conditional GETs against pre-rendered HTML return `304 Not Modified` for free.

`AbortController` is not applicable — SSG serves pre-rendered files; there is no per-request render to cancel. The runtime SSR example (`../ssr/`) demonstrates `AbortController` for that case.

Demonstrated by 2 dedicated tests in `e2e/ssg.spec.ts`.

## Key Packages

- `@real-router/core` — `createRouter()` + base router types
- `@real-router/core/api` — `cloneRouter()` (per-build-URL isolation; subpath, NOT root export)
- `@real-router/core/utils` — `getStaticPaths()`, `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading at build time
- `@real-router/ssr-data-plugin/errors` — typed loader errors (`LoaderNotFound`, etc.)
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, hooks
- `@real-router/browser-plugin` — client-side URL sync after hydration
