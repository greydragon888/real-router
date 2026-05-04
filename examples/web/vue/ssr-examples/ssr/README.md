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

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server/index.ts` adds three production-grade pieces on top of the basic SSR wiring:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Identical inputs yield identical hashes; conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. Distinct routes yield distinct ETags.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60`, `/users/:id` → `public, max-age=120`, `/dashboard` and `/admin` → `private, no-store`, `/slow`/`/boom` → `no-store`.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the `slow` loader pulls the signal via `getDep("abortSignal")` and clears its `setTimeout`. Without this wiring a 5 s loader holds the worker even after the client gives up. The e2e suite verifies the server releases the handler within 1 s (well under the 5 s loader delay).

These are demonstrated end-to-end by 4 dedicated tests in `e2e/ssr.spec.ts` (Cache-Control routing, 304 on identical content, distinct routes → distinct hashes, AbortController fast release).

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
