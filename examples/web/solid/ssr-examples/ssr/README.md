# SSR Solid Example

> Real-Router with classical Solid SSR — `renderToString` + `generateHydrationScript()` over Express + Vite.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data` resolves before render, mirrors React/Vue
- **`solid-js/web.renderToString`** — sync, atomic SSR. The full tree is serialized in one pass
- **`solid-js/web.generateHydrationScript`** — Solid-only artifact that must be injected into `<head>` so the client hydration runtime (`_$HY`) finds the SSR snapshot
- **`solid-js/web.hydrate`** — separate from `render()`. Use `hydrate(() => <App />, root)` after `await hydrateRouter(router, ssrState)` so the router state is rebuilt before Solid claims the DOM
- **Per-request `cloneRouter()`** — guard plugins (`canActivate`) read deps via `cloneRouter(base, { currentUser })` so concurrent requests do not bleed state
- **`@real-router/browser-plugin` only on the client** — `entry-server.tsx` does not register it (it touches `globalThis.history`/`window.location`)
- **`vite-plugin-solid({ ssr: true })`** — required. Sets `hydratable: true` for both client and server builds, plus `generate: 'ssr'` for the server bundle. Without it, the client bundle has no hydration markers and the first render mismatches
- **Loader-driven HTTP semantics** — typed loader errors (`LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout` in `src/_loader-errors.ts`) are caught by `entry-server.tsx` and mapped to `301/302`, `404`, and `504` responses. `users.profile` throws `LoaderNotFound` for unknown ids → 404; `legacyUser` (`/legacy-user/:id`) throws `LoaderRedirect("/users/:id", 301)` — canonical-URL pattern; `slow` (`/slow`) demonstrates `withTimeout()` — sleeps 5 s but is wrapped in 250 ms budget, server responds 504 instead of hanging.
- **Per-route `<head>` injection** — `meta.ts` resolves `PageMeta` per route (title + description). `entry-server.tsx` splices the rendered head markup into the `<!--ssr-head-->` placeholder ahead of the body. `/users` reflects the current `?sort` param in its `<title>`.
- **`renderToStringAsync` (third Solid SSR mode)** — `/async-page` uses `<Suspense>` + `createResource` with a 500 ms server-side delay. `entry-server.tsx` switched from `renderToString` → `renderToStringAsync`, which awaits every Suspense boundary before flushing. Pages without Suspense behave identically; pages with Suspense block the response until resolved (single buffered string, no chunked transfer).
- **`createUniqueId` for SSR-safe stable IDs** — `/form` uses `createUniqueId()` for `<label htmlFor>` + `<input id>` + `aria-describedby` bindings. Server-rendered IDs are deterministic; client hydration sees the same values — no hydration mismatch, accessibility relations stay intact.
- **Dynamic `<head>` updates after CSR navigation** — `<AutoMeta />` reads route state via `useRoute()` and a Solid `createEffect` mutates `document.title` + `<meta name="description">` reactively. After `/` → `/users` CSR navigation the head reflects the new route from `getMetaForState()` without manual DOM assignments.
  - **Honest limitation about `@solidjs/meta`**: the package is installed but **not** wired through `<MetaProvider>` on the server. Its `useAssets`-based asset injection is designed for `renderToStream` (streaming SSR); under `renderToStringAsync` the rendered `<Title>`/`<Meta>` tags don't reliably surface in the final HTML output on Solid 1.9.5. Server-side head therefore stays on the manual `<!--ssr-head-->` injection. Client-side dynamic updates use the equivalent low-level `createEffect` pattern that `@solidjs/meta` would invoke internally on the client. See `components/AutoMeta.tsx` docstring for the full disclaimer.

## Architecture

```
Server (per request):
  cloneRouter(base, { currentUser })
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                   # critical data resolved
    → renderToString(<RouterProvider><App /></RouterProvider>)
    → generateHydrationScript()                    # must precede <body>
    → serializeRouterState(state) → __SSR_STATE__  # path + params + context.data
    → cleanup() (router.dispose() in finally)

Client (initial hydration):
  createAppRouter({ currentUser })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)  # rebuilds state via start(state.path)
    → hydrate(() => <RouterProvider><App /></RouterProvider>, #root)
                                                   # claims DOM, attaches handlers
                                                   # browser-plugin handles SPA nav after this
```

## Solid-Specific Gotchas

- **`generateHydrationScript()` is mandatory.** Without it, `_$HY` is undefined on the client and Solid emits hydration mismatch warnings + falls back to a full re-render — losing every streamed/SSR'd byte. The server returns `hydrationScript` as a separate field; the Express handler injects it via the `<!--ssr-hydration-script-->` placeholder
- **`hydrate` ≠ `render`.** Both live in `solid-js/web` but they are different functions. `render()` mounts fresh; `hydrate()` claims existing DOM. Mixing them up produces silent mismatches that look like flicker
- **Hooks return `Accessor<T>` even on the server.** `useRoute()` returns `Accessor<RouteState>` — read with `routeState().route.context.data`, not `routeState.route.context.data`
- **Components run once.** Solid components do not re-execute on prop changes; signals propagate updates. For SSR this means the render tree resolves synchronously — no async setup
- **`onMount` is SSR-safe.** The Solid runtime guarantees `onMount` callbacks never fire during `renderToString`/`renderToStream`. The adapter's `RouterProvider` uses `onMount` for `announceNavigation`/`scrollRestoration`/`viewTransitions` — all client-only by guarantee, no manual `isServer` branching needed

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # tsc + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## Mapping Loader Errors to HTTP

`entry-server.tsx` inspects the `code` field of any error thrown out of `router.start()`:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates → 500 with `<server-error>` body  |

Trade-offs:
- The `404`/`504` bodies are plain text rather than the SSR-rendered NotFound page. Rendering a rich 404 would require a second `renderToString()` pass with a different URL — kept simple in this demo.
- `withTimeout()` doesn't cancel the underlying loader work — only races the response. Pair with `AbortController` for production workloads.

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server/index.ts` adds three production-grade pieces on top of the basic SSR wiring:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Identical inputs yield identical hashes; conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. Solid's home is static, so two consecutive GETs to `/` produce the same hash; `/users` and `/` produce distinct hashes (the test verifies content-derivation by route comparison).
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60`, `/users/:id` → `public, max-age=120`, `/dashboard` and `/admin` → `private, no-store`, `/legacy-user/:id` → 1-day cache for the redirect itself, `/slow`/`/boom`/`/async-page`/`/form` → `no-store`.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the `slow` loader pulls the signal via `getDep("abortSignal")` and clears its `setTimeout`. Without this wiring a 5 s loader holds the worker even after the client gives up. The e2e suite verifies the server releases the handler within 1 s (well under the 5 s loader delay).

These are demonstrated end-to-end by 4 dedicated tests in `e2e/ssr.spec.ts` (Cache-Control routing, 304 on identical content, distinct routes → distinct hashes, AbortController fast release).

## E2e

[`e2e/ssr.spec.ts`](e2e/ssr.spec.ts) — 46 Playwright scenarios:

- 27 baseline (per-request isolation, hydration round-trip, loaders, guards, query params, nested loaders, 404, 500, CSR navigation, `<Link>` href in no-JS mode)
- Solid-specific: `_$HY` hydration runtime variable injected via `generateHydrationScript()`; `data-hk-*` markers present in server-rendered HTML (proof `hydratable: true` is active)
- **Loader-driven HTTP** (4 tests): `/users/9999` → 404 (incl. nested `/posts`), `/legacy-user/2` → 301 + Location, `/legacy-user/3` follows to a hydrated profile, `/slow` → 504 within 2.5 s budget
- **`<head>` injection** (2 tests): home title + reactive title for `/users?sort=`
- **CSR navigate spy** (1 test): clicking a profile link issues zero document/fetch requests
- **Mixed-guard concurrent** (1 test): admin × user × anon × 5 routes in parallel
- **Cache-Control + ETag + AbortController** (4 tests): per-route Cache-Control directives match `src/router/cache-policies.ts`; `/users` 304 on conditional GET; `/` and `/users` yield distinct content hashes; `/slow` releases the handler in <1 s when the client disconnects (vs the 5 s loader delay)

## See Also

- [`@real-router/solid`](../../../../../packages/solid)
- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssr`](../../../vue/ssr-examples/ssr) — Vue counterpart with the same e2e contract
- Solid docs: [`renderToString`](https://docs.solidjs.com/reference/rendering/render-to-string), [`hydrate`](https://docs.solidjs.com/reference/rendering/hydrate), [`generateHydrationScript`](https://docs.solidjs.com/reference/rendering/generate-hydration-script)
