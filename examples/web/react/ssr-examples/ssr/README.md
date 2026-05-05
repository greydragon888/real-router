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

The client-side `ssrDataPluginFactory` registration handles **hydration only**: `hydrateRouter(router, ssrState)` calls `router.start(state.path)` once, and the plugin's `start` interceptor re-runs the loader on the client to repopulate `state.context.data`. This guarantees the post-hydration component tree sees the same data the server rendered — no flash, no mismatch.

**SSR-only by design:** the plugin intercepts `start()`, **not** `navigate()`. After hydration, subsequent `<Link>` clicks (or `router.navigate()` calls) do NOT re-run loaders. Routes visited via client navigation see `state.context.data` from whatever was last set by `start`/hydration — for routes never resolved during initial SSR, `state.context.data` is `undefined`. Application code that needs fresh data on client navigation has three options: (a) use `router.navigate(name, params, { reload: true })` to bypass `SAME_STATES` and trigger a fresh resolution flow (note: this still does not invoke the `start` interceptor), (b) layer a CSR data-fetching library (TanStack Query, SWR) on top, or (c) trigger a full reload via native `<a href>`. For the SSR demo here, the loader's data is always present after the initial `start` because every public route has a loader entry; the limitation surfaces only when navigating client-side to a route whose data wasn't in the initial SSR snapshot.

## Running

```bash
pnpm dev          # Dev server with HMR (Express + Vite middleware)
pnpm build:app    # Build client + server bundles
pnpm preview      # Production server
pnpm test:e2e     # Playwright tests
```

## Loader-driven HTTP: typed errors → 301/404/504

`src/_loader-errors.ts` defines three named errors and a `withTimeout()` helper. Loaders throw them; `entry-server.tsx` catches by `code`, maps each to a `RenderResult` shape; `server/index.ts` emits the corresponding HTTP status:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates → 500 with `<server-error>` body  |

Demonstrated routes:
- `/users/9999` → `LoaderNotFound("user:9999")` → 404 text/plain
- `/users/9999/posts` → same path, leaf loader checks the same store
- `/legacy-user/:id` → `LoaderRedirect("/users/:id", 301)` → 301 + Location
- `/slow` → 5 s loader behind a 250 ms `withTimeout()` race → `LoaderTimeout` → 504

Trade-offs: `withTimeout()` doesn't cancel the underlying loader work — only races the response. Pair with the `AbortController` wiring (next section) for production. The `slow` loader does both.

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server/index.ts` adds three production-grade pieces on top of the basic SSR wiring:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Identical inputs yield identical hashes; conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. Distinct routes yield distinct ETags.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60`, `/users/:id` → `public, max-age=120`, `/dashboard` and `/admin` → `private, no-store`, `/slow`/`/boom` → `no-store`.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the `slow` loader pulls the signal via `getDep("abortSignal")` and clears its `setTimeout`. Without this wiring a 5 s loader holds the worker even after the client gives up.

Demonstrated by 4 dedicated tests in `e2e/ssr.spec.ts`.

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync
