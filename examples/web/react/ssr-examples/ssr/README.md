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
  _auth.ts            Cookie → currentUser resolver (parses userId / legacy auth=1)
  dev.ts              Express + Vite dev middleware (HMR)
  index.ts            Express production server (sha256 ETag, Cache-Control, AbortController)
src/
  database.ts         In-memory mock store (single source of truth for users + posts)
  entry-server.tsx    render(url, context) → { html, serializedData, statusCode, redirect, head, rawBody?, contentType? }
  entry-client.tsx    hydrateRouter() + hydrateRoot() with browser-plugin + ssr-data-plugin
  App.tsx             Shared component tree (server + client)
  components/
    SearchForm.tsx    useId-stable form labels (proves SSR/CSR id parity)
  router/
    routes.ts         Route definitions with auth + role guards (incl. legacyUser, slow)
    loaders.ts        Per-route data loaders (typed errors via @real-router/ssr-data-plugin/errors)
    createAppRouter.ts  Thin createRouter() wrapper that forwards deps as the third arg
    meta.ts           Per-route PageMeta resolver (canonical absolute URL, og:title/description/url)
    cache-policies.ts Per-URL Cache-Control mapping
  pages/
    Home.tsx, UsersList.tsx, UserProfile.tsx, UserPosts.tsx,
    Dashboard.tsx, Admin.tsx, NotFound.tsx
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
      → deposits parsed state in scratchpad, calls router.start(path)
      → ssr-data-plugin reads state.context.data from scratchpad (#596) — loader skipped
    → hydrateRoot(<RouterProvider><App /></RouterProvider>)
```

The client-side `ssrDataPluginFactory` registration handles **hydration**: `hydrateRouter(router, ssrState)` deposits the parsed state into a one-shot internal scratchpad on `RouterInternals.hydrationState`, then calls `router.start(state.path)`. The plugin's `start` interceptor reads the scratchpad and reuses the server-resolved `state.context.data` instead of re-running the loader (#596) — no flash, no mismatch, no second round-trip on first paint. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssr.spec.ts`](e2e/ssr.spec.ts).

**SSR-only by design:** the plugin intercepts `start()`, **not** `navigate()`. After hydration, subsequent `<Link>` clicks (or `router.navigate()` calls) do NOT trigger loaders. Routes visited via client navigation see `state.context.data` from whatever was last set by `start`/hydration — for routes never resolved during initial SSR, `state.context.data` is `undefined`. Application code that needs fresh data on client navigation has three options: (a) use `router.navigate(name, params, { reload: true })` to bypass `SAME_STATES` and trigger a fresh resolution flow (note: this still does not invoke the `start` interceptor), (b) layer a CSR data-fetching library (TanStack Query, SWR) on top, or (c) trigger a full reload via native `<a href>`. For the SSR demo here, the loader's data is always present after the initial `start` because every public route has a loader entry; the limitation surfaces only when navigating client-side to a route whose data wasn't in the initial SSR snapshot.

## Running

```bash
pnpm dev          # Dev server with HMR (Express + Vite middleware)
pnpm build:app    # Build client + server bundles
pnpm preview      # Production server
pnpm test:e2e     # Playwright tests
```

## React 19 `useId()` for SSR-stable form IDs

`src/components/SearchForm.tsx` uses `useId()` for `<label htmlFor={...}>` ↔ `<input id={...}>` pairing. Returns a stable per-component-instance ID; SSR and client produce identical values, so the a11y contract survives hydration. Hand-rolled IDs (`Math.random`, module-level counter, `crypto.randomUUID`) all break this contract — useId is the canonical fix. Maps to Vue 3.5's `useId()` and Solid's `createUniqueId()`.

React's useId emits IDs like `_R_u_` and `_R_uH1_` (internal format, stable per render). SearchForm is mounted on the home page; 3 e2e tests verify: label[for]=input[id] for both fields with distinct IDs, SSR-emitted ID matches client DOM with zero hydration warnings, form remains interactive post-hydration (typing into input updates state).

## Per-route meta with canonical/og

`src/router/meta.ts` resolves a `PageMeta` block (`title`, `description`, `canonical`, `ogTitle`, `ogDescription`) from the matched router state. `entry-server.tsx` calls `renderHeadFor(meta)` to produce the `<head>` markup; the server splices it into the `<!--ssr-meta-->` placeholder of the template before sending the response. canonical URLs are absolute (prefixed with `SITE_ORIGIN`, defaulting to `https://example.com`) — search engines and social-media crawlers reject relative canonicals.

5 e2e tests verify: home title/description in raw SSR HTML, sort-param interpolation, name in profile title + og:title, absolute canonical, distinct og:description per route.

## Loader-driven HTTP: typed errors → 301/404/504

Typed loader errors live in `@real-router/ssr-data-plugin/errors` (hoisted from per-example `_loader-errors.ts` files in commit `e7ad413e`). The package exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and a `withTimeout()` helper. Loaders throw them; `entry-server.tsx` catches by `code`, maps each to a `RenderResult` shape; `server/index.ts` emits the corresponding HTTP status:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates → 500 with `<server-error>` body  |

Demonstrated routes:
- `/users/9999` → `LoaderNotFound("user:9999")` → 404 text/plain
- `/users/9999/posts` → leaf loader re-validates the parent user id; same `LoaderNotFound` path
- `/legacy-user/:id` → `LoaderRedirect(\`/users/${id}\`, 301)` → 301 + Location (target is interpolated from params, not a template)
- `/slow` → 5 s loader behind a 250 ms `withTimeout()` race → `LoaderTimeout` → 504

`withTimeout()` cancellation is cooperative (#598). When the deadline elapses, the loader's `{ signal }` aborts *before* the race rejects with `LoaderTimeout`, so loader I/O honoring the signal — e.g. `fetch(url, { signal })` — actually cancels at the network layer (proven by the `withTimeout (#598) network cancellation` e2e). The `slow` loader composes the deadline with `options.upstreamSignal` (client disconnect) — composed signal aborts on whichever fires first.

## Auth + role gates

Two layers of authorization, demonstrated end-to-end:

- `/dashboard` — gated by `canActivate: () => getDep("currentUser") !== null`. Anonymous users get redirected to `/`. Verified by 2 e2e tests (anon → 302, authenticated → 200).
- `/admin` — gated by a role-aware guard: `getDep("currentUser")?.role === "admin"`. Non-admin Bob (`userId=2`) gets a 302; admin Alice (`userId=1`) gets the admin page. Verified by 3 e2e tests (admin guard, non-admin redirect, dashboard allows non-admin).

`server/_auth.ts` parses the `userId` cookie (or legacy `auth=1`) into a `CurrentUser` object on the server; `entry-client.tsx` mirrors the same logic over `document.cookie` so the post-hydration guard sees the same DI value as the SSR pass — otherwise client-side guard checks would diverge.

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server/index.ts` adds three production-grade pieces on top of the basic SSR wiring:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Identical inputs yield identical hashes; conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. Distinct routes yield distinct ETags.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, max-age=300, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60, must-revalidate`, `/users/:id` → `public, max-age=120, must-revalidate`, `/dashboard` and `/admin` → `private, no-store`, `/slow`/`/boom` → `no-store`.
- **`AbortController` per request** — `req.on("close")` aborts the controller; `entry-server.tsx:91-95` forwards the signal into the per-request DI map via `cloneRouter(baseRouter, { currentUser, abortSignal })`. The `slow` loader retrieves it through `getDep("abortSignal")` and forwards it as `withTimeout(..., { upstreamSignal })`; the resulting composed signal aborts on either the 250 ms deadline or client disconnect, and `fetch(..., { signal })` propagates the abort to the network layer (#598). Without this wiring a 5 s upstream `fetch` would hold the worker even after the client gives up.

Demonstrated by 4 dedicated tests in `e2e/ssr.spec.ts`.

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/react` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync
