# SSR Preact Example

Server-side rendering with Real-Router, Preact 10, Express, and Vite.

## What This Demonstrates

- **Per-request router cloning** via `cloneRouter()` — each request gets an isolated router instance
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route loaders run during `start(url)` and write to `state.context.data`
- **State serialization** via `serializeRouterState()` (XSS-safe) — full router state embedded in HTML `<script>` tag
- **Client hydration** — `hydrateRouter(router, __SSR_STATE__)` re-resolves router state by `state.path`; Preact `hydrate()` reuses server-rendered DOM without mismatch
- **Auth-gated routes** — dashboard / admin pages protected by `canActivate` guard with server-side dependency injection (cookie → `currentUser`)
- **Typed loader errors** — `LoaderNotFound` / `LoaderRedirect` / `LoaderTimeout` from `@real-router/ssr-data-plugin/errors` map to 404 / 30x / 504 HTTP responses
- **Per-route meta** — title + description + canonical (absolute URL) + OpenGraph block spliced into HTML head
- **Production HTTP semantics** — strong ETag (sha256 of body), per-route Cache-Control, AbortController on request close (cancels slow loaders)
- **`useId()` for SSR-stable form IDs** — supported in `preact-render-to-string@6.6.5+` (Dec 2025), same hook name as React 18+; deterministic per-instance, no hydration mismatch
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation; `ssr-data-plugin` is registered on the client too so subsequent navigations re-resolve via `start` (hydration path), but the SSR-only contract holds for `navigate()`

## Architecture

```
server/
  dev.ts              Express + Vite middleware (HMR)
  index.ts            Express production server (serves built assets, ETag, Cache-Control)
  _auth.ts            Cookie → currentUser resolver
src/
  database.ts         In-memory mock store (single source of truth for users/posts)
  entry-server.tsx    render(url, ctx) → { html, serializedData, statusCode, redirect, head, rawBody?, contentType? }
  entry-client.tsx    hydrateRouter() + Preact hydrate() with browser-plugin + ssr-data-plugin
  App.tsx             Shared component tree (server + client)
  components/
    SearchForm.tsx    useId-driven form labels (SSR-stable IDs)
  router/
    routes.ts         Route definitions with canActivate auth guard
    loaders.ts        Per-route data loaders + typed errors (consume database, write to state.context.data)
    cache-policies.ts Per-route Cache-Control mapping
    meta.ts           Per-route PageMeta resolver (canonical, og)
    createAppRouter.ts  Router factory with dependency injection
  pages/
    Home.tsx, UsersList.tsx, UserProfile.tsx, UserPosts.tsx, Dashboard.tsx, Admin.tsx, NotFound.tsx
```

## SSR Flow

```
Server (per request):
  cloneRouter(base, { currentUser, abortSignal })
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)
      → route matched → guards run → loader runs → state.context.data populated
    → renderToString(<RouterProvider><App /></RouterProvider>)   ─ preact-render-to-string sync
      → pages read state.context.data via useRoute()
    → serializeRouterState(state) → embed in HTML as window.__SSR_STATE__
    → dispose()

Client (once):
  createAppRouter({ currentUser })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)
      → deposits parsed state in scratchpad, calls router.start(path)
      → ssr-data-plugin reads state.context.data from scratchpad (#596) — loader skipped
    → hydrate(<RouterProvider><App /></RouterProvider>, rootElement)   ─ Preact hydrate
```

The client-side `ssrDataPluginFactory` registration handles **hydration**: `hydrateRouter(router, ssrState)` deposits the parsed state into a one-shot internal scratchpad on `RouterInternals.hydrationState`, then calls `router.start(state.path)`. The plugin's `start` interceptor reads the scratchpad and reuses the server-resolved `state.context.data` instead of re-running the loader (#596) — no flash, no mismatch, no second round-trip on first paint. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssr.spec.ts`](e2e/ssr.spec.ts).

## `renderToStringAsync` — Preact-unique async-single-shot SSR

`preact-render-to-string` exposes both `renderToString` (sync) and `renderToStringAsync` (async). This example uses **async** in `entry-server.tsx`, even though `ssr-data-plugin` already pre-awaits all loaders before render begins. The reason: `<Home />` mounts a `lazy(() => import("./components/Tagline"))` boundary wrapped in `<Suspense>`. With `renderToStringAsync`:

- The dynamic import is awaited inside the render call.
- Resolved Tagline content is **inlined** into the final HTML (no fallback shipped to the consumer).
- The response is a single complete string — `Content-Length` set, **no `Transfer-Encoding: chunked`**.

This is a **Preact-only** SSR path. React 19's `react-dom/server` has no sync-with-async-data equivalent — to await in-tree promises you must opt into the streaming pipeline (`renderToReadableStream` or `renderToPipeableStream`). Preact gives you three choices, this example picks the middle one:

| Renderer | Output | Lazy/Suspense behaviour | When to pick |
|---|---|---|---|
| `renderToString` (sync) | full HTML string | fallback emitted; lazy boundary deferred | classical SSR with no in-tree async |
| **`renderToStringAsync`** | **full HTML string** | **awaits, inlines resolved content** | **single-shot async SSR — this example** |
| `renderToReadableStream` | `ReadableStream<Uint8Array>` | fallback inline + `<preact-island>` swap chunk | streaming with TTFB-sensitive UX (see `../ssr-streaming/`) |

Verified by 3 dedicated e2e tests:
- Tagline content is inlined in the response body (no fallback marker, no `<preact-island>` machinery).
- Response is **not** chunked (`Content-Length` header set; `Transfer-Encoding: chunked` absent).
- Vite emits `Tagline-<hash>.js` as a separate client chunk for hydration / future client navigations.

## Loader-driven HTTP: typed errors → 301/404/504

`@real-router/ssr-data-plugin/errors` exposes the canonical error classes. Loaders throw them; `entry-server.tsx` catches by `code`, maps each to a `RenderResult` shape; `server/index.ts` emits the corresponding HTTP status:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates → 500 with `<server-error>` body  |

Demonstrated routes: `/users/9999` (404), `/legacy-user/:id` → `/users/:id` (301), `/slow` (504 via `withTimeout` race), `/boom` (500).

## Production HTTP semantics

`server/index.ts` adds three production-grade pieces:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Conditional GET (`If-None-Match`) returns `304 Not Modified` with empty body.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives. Auth-private paths get `private, no-store`; public paths get long max-age + s-maxage.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the `slow` loader pulls the signal via `getDep("abortSignal")` and clears its `setTimeout`. Without this wiring, a 5 s loader holds the worker even after the client gives up.

## Running

```bash
pnpm dev          # Dev server with HMR (Express + Vite middleware)
pnpm build:app    # Build client + server bundles
pnpm preview      # Production server
pnpm test:e2e     # Playwright tests
```

## Differences from `react/ssr-examples/ssr/`

- **Renderer**: `preact-render-to-string@6.6.7` `renderToString` (sync) instead of `react-dom/server` `renderToString`.
- **Hydration**: Preact `hydrate(vnode, parent)` (parameter order reversed vs React's `hydrateRoot(container, vnode)`; no separate root object).
- **Hooks**: `useId`, `useState` from `preact/hooks`. Preact's `useId` works since `preact-render-to-string@6.6.5` (Dec 2025).
- **Vite plugin**: `@preact/preset-vite` instead of `@vitejs/plugin-react`. JSX import source set to `preact` via `tsconfig.json`'s `jsxImportSource`.
- **Bundle size**: ~3-4× smaller client bundle than the React equivalent (Preact 10 is ~3 KB gzipped).
- **No RSC**: Preact does not support React Server Components — see [`../README.md`](../README.md).

## Required: `resolve.dedupe` for Preact in monorepo Vite configs

`vite.config.ts` pins `resolve.dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"]`. Without this, `@real-router/preact`'s `preact` peer can resolve to a different copy than the example's pinned `preact`, producing **two hook runtimes in the same bundle**. Symptoms: `Cannot read properties of undefined (reading '__H')` thrown during hydration, and Preact wipes the server-rendered DOM on mount.

This is the canonical Vite-monorepo-Preact pitfall — repeats whenever a new Preact example is added. All three SSR examples (`ssr/`, `ssr-streaming/`, `ssg/`) ship the same dedupe block.

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/ssr-data-plugin/errors` — typed loader errors
- `@real-router/preact` — `RouterProvider`, `RouteView`, `Link`, hooks
- `@real-router/browser-plugin` — client-side URL sync after hydration
