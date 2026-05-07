# SSR Vue Example

Server-side rendering with Real-Router, Vue 3, Express, and Vite — the Vue port of the React `ssr/` example.

## What This Demonstrates

- **Per-request router cloning** via `cloneRouter()` — each request gets an isolated router instance
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route-specific loaders run during `start(url)` and write to `state.context.data`
- **State serialization** via `serializeRouterState()` (XSS-safe) — full router state embedded in HTML `<script>` tag
- **Client hydration** — `hydrateRouter(router, __SSR_STATE__)` re-resolves router state by `state.path`; Vue `createSSRApp(...).mount()` reuses server-rendered DOM without mismatch
- **Cookie-based DI + auth-gated routes** — dashboard and admin protected by `canActivate` guards consuming `getDep("currentUser")`
- **Query params + nested loaders** — `?sort` on `/users`, leaf-route loader for `/users/:id/posts` returns combined parent + child data
- **Typed loader errors → HTTP** — `LoaderRedirect`/`LoaderNotFound`/`LoaderTimeout` thrown by loaders surface as `301`/`404`/`504`. Untyped rejections fall through to a deterministic 500 error page. Full table in the "Loader-driven HTTP" section below.
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation

## Architecture

```
server/
  _auth.ts            Re-exports parseCookieHeader + lookupUserFromCookies from src/_known-users.ts
                      (server entry point — cookie → currentUser resolver)
  dev.ts              Express + Vite dev middleware (HMR); mirrors AbortController +
                      Cache-Control wiring from index.ts (only ETag is prod-only)
  index.ts            Express production server (sha256 ETag, Cache-Control, AbortController)
src/
  _known-users.ts     KNOWN_USERS table + parseCookieHeader + lookupUserFromCookies;
                      shared between server/_auth.ts and entry-client.ts so post-hydration
                      guards see the same DI value as the SSR pass
  database.ts         In-memory mock store (id "9999" intentionally absent — used by
                      LoaderNotFound tests; any unknown id behaves the same)
  entry-server.ts     render(url, context) → { html, head, serializedData, statusCode, redirect, rawBody?, contentType? }
  entry-client.ts     hydrateRouter() + createSSRApp().mount() with browser-plugin + ssr-data-plugin
  App.vue             Shared component tree (server + client)
  components/
    HeavyAnalytics.vue   Lazy-hydrated component (defineAsyncComponent + hydrateOnVisible)
    SearchForm.vue       Form with useId() for SSR-stable label↔input pairing
  directives/
    track-view.ts     Vue custom directive (mounted/updated/unmounted) — IntersectionObserver demo
  router/
    routes.ts         Route definitions with auth + role guards (incl. /slow, /legacy-user/:id, /boom)
    loaders.ts        Per-route data loaders (typed errors via @real-router/ssr-data-plugin/errors)
    cache-policies.ts Per-route Cache-Control resolver
    meta.ts           Per-route PageMeta (title/description/canonical/og*)
    createAppRouter.ts  Router factory that forwards deps to createRouter()
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
  createAppRouter({ currentUser: lookupUserFromCookies(parseCookieHeader(document.cookie)) })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)
      → deposits parsed state in scratchpad, calls router.start(path)
      → ssr-data-plugin reads state.context.data from scratchpad (#596) — loader skipped
    → createSSRApp(...).mount("#root")
```

`server/_auth.ts` and `entry-client.ts` both consume the same `lookupUserFromCookies` / `parseCookieHeader` helpers from `src/_known-users.ts`. This parity is why post-hydration `canActivate` guards see the same `currentUser` DI value as the SSR pass — otherwise client-side guard checks would diverge.

`serializeRouterState(state)` emits a `{ name, params, path, context }` snapshot; `hydrateRouter(router, state)` deposits it into a one-shot internal scratchpad on `RouterInternals.hydrationState` and delegates to `router.start(state.path)`. The plugin's `start` interceptor reuses the server-resolved `state.context.data` from the scratchpad and skips the loader (#596) — invisible for in-memory data, one **avoided** fetch for real APIs. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssr.spec.ts`](e2e/ssr.spec.ts).

The client-side `ssrDataPluginFactory` registration handles **hydration**: post-hydration the component tree sees the same `state.context.data` the server rendered — no flash, no mismatch, no second round-trip.

**SSR-only by design:** the plugin intercepts `start()`, **not** `navigate()`. After hydration, subsequent `<Link>` clicks do NOT trigger loaders — same contract as the React example.

## Vue 3.5 lazy hydration + `useId()`

Two Vue 3.5–specific surface-area pieces, mounted on the home page:

- **Lazy hydration** — `src/components/HeavyAnalytics.vue` is wrapped via `defineAsyncComponent({ loader, hydrate: hydrateOnVisible() })`. Server fully renders the HTML (crawlers and JS-disabled clients see everything), but the client defers JS hydration until the component scrolls into view. Until the strategy fires, `onMounted` does NOT run, event handlers are not attached, and the component's separate JS chunk is not loaded — pure savings on time-to-interactive for content the user has not seen yet. Maps to Angular's `@defer (on viewport) + withIncrementalHydration()`. Other strategies available: `hydrateOnIdle()`, `hydrateOnInteraction()`, `hydrateOnMediaQuery()`, custom function.
- **`useId()`** — `src/components/SearchForm.vue` uses `useId()` for `<label :for="...">` ↔ `<input :id="...">` pairing. Returns a stable per-component-instance ID; SSR and client produce identical values, so the a11y contract survives hydration. Hand-rolled IDs (`Math.random`, module-level counter, `crypto.randomUUID`) all break this contract — useId is the canonical fix. Maps to Solid's `createUniqueId()` and React's `useId()`.

Verified by 5 e2e tests: SSR HTML present pre-hydration + counter unresponsive (×1), scroll-into-view fires hydration + counter responds (×1), code-split chunk exists on disk + is NOT preloaded by initial HTML (×1), label[for]=input[id] for both fields with distinct ids (×1), SSR-emitted id matches client DOM with zero hydration warnings (×1).

## Per-route meta + Vue custom directive

`src/router/meta.ts` resolves a `PageMeta` block (`title`, `description`, `canonical`, `ogTitle`, `ogDescription`) from the matched router state. `entry-server.ts` calls `renderHeadFor(meta)` to produce the `<head>` markup; the server splices it into the `<!--ssr-meta-->` placeholder of the template before sending the response. canonical URLs are absolute (prefixed with `SITE_ORIGIN`, defaulting to `https://example.com`) — search engines and social-media crawlers reject relative canonicals.

`src/directives/track-view.ts` exposes a Vue custom directive (`v-track-view`) that demonstrates the full directive lifecycle:
- `mounted(el, binding)` — sets up an `IntersectionObserver`. SSR skips this hook entirely, so referencing browser-only APIs is safe (no `typeof window === "undefined"` guard needed).
- `updated(el, binding)` — fires when the bound `binding.value` changes reactively. `UserProfile.vue` uses a `computed` that flips between `data.user.id` and `"999"` after a button click; Vue diffs the new binding and calls `updated()` with the new value.
- `unmounted(el)` — disconnects the observer.

Verified by 7 e2e tests in this file: meta per route (home title/description, sort-param interpolation, name in profile title + og:title, absolute canonical, distinct og:description), directive update lifecycle via `__VIEW_UPDATE_LOG__`, and SSR safety check confirming the directive body doesn't run server-side.

## Loader-driven HTTP: typed errors → 301/404/504

Typed loader errors live in `@real-router/ssr-data-plugin/errors` (hoisted from per-example `_loader-errors.ts` files in commit `e7ad413e`). The package exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and a `withTimeout()` helper. Loaders throw them; `entry-server.ts` catches by `code`, maps each to a `RenderResult` shape; `server/index.ts` emits the corresponding HTTP status:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates → 500 with `<server-error>` body  |

Demonstrated routes:
- `/users/9999` → `LoaderNotFound("user:9999")` → 404 text/plain (id `9999` is intentionally absent from `database.ts`; any unknown id behaves the same)
- `/users/9999/posts` → leaf loader re-validates the parent user id; same `LoaderNotFound` path
- `/legacy-user/:id` → `LoaderRedirect(\`/users/${id}\`, 301)` → 301 + Location (target interpolated from params)
- `/slow` → 5 s loader behind a 250 ms `withTimeout()` race → `LoaderTimeout` → 504
- `/boom` → loader throws a generic `Error` → falls through to the catch-all 500 with `<server-error>` body (untyped-rejection path; verified by an e2e test)

Trade-offs:
- The `404`/`504` bodies are plain text rather than the SSR-rendered NotFound page. Rendering a rich 404 would require a second `render()` pass with a different URL — kept simple in this demo.
- `withTimeout()` cancellation is cooperative (#598): the loader receives `{ signal }` that aborts *before* the race rejects with `LoaderTimeout`, so loaders threading `signal` into their I/O actually cancel the work. The `slow` loader composes the deadline with `options.upstreamSignal` (client disconnect from per-request DI) — composed signal aborts on whichever fires first.

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server/index.ts` adds three production-grade pieces on top of the basic SSR wiring:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Identical inputs yield identical hashes; conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. Distinct routes yield distinct ETags.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, max-age=300, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60, must-revalidate`, `/users/:id` → `public, max-age=120, must-revalidate`, `/dashboard` and `/admin` → `private, no-store`, `/slow`/`/boom` → `no-store`. (`server/dev.ts` mirrors the same Cache-Control wiring; only ETag is prod-only.)
- **`AbortController` per request** — `req.on("close")` aborts the controller; the `slow` loader pulls the signal via `getDep("abortSignal")` and forwards it as `withTimeout(..., { upstreamSignal })`; the composed signal aborts on either the 250 ms deadline or client disconnect, and `fetch(..., { signal })` propagates the abort to the network layer (#598). Without this wiring a 5 s upstream `fetch` would hold the worker even after the client gives up. The e2e suite verifies the server releases the handler within 1 s (well under the 5 s loader delay) and asserts via `/__bench/abort-count` that the upstream fetch is cancelled at the network layer.

These are demonstrated end-to-end by 4 dedicated tests in `e2e/ssr.spec.ts` (Cache-Control routing, 304 on identical content, distinct routes → distinct hashes, AbortController fast release).

## Running

```bash
pnpm dev          # Dev server with HMR (Express + Vite middleware)
pnpm build:app    # Build client + server bundles
pnpm preview      # Production server
pnpm test:e2e     # Playwright tests
```

## Key Packages

- `@real-router/core` — `createRouter()` + base router types
- `@real-router/core/api` — `cloneRouter()` (subpath, NOT root export)
- `@real-router/core/utils` — `serializeRouterState()`, `hydrateRouter()`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/ssr-data-plugin/errors` — typed loader errors (`LoaderNotFound`, etc.)
- `@real-router/vue` — `RouterProvider`, `RouteView`, `Link`, `useRoute`
- `@real-router/browser-plugin` — client-side URL sync

## See Also

- [`examples/web/react/ssr-examples/ssr/`](../../../react/ssr-examples/ssr) — React 19 counterpart
