# SSR Svelte Example

> Real-Router with classical Svelte 5 SSR — `svelte/server.render` + `<svelte:head>` over Express + Vite.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data` resolves before render, identical contract to React/Vue/Solid
- **`svelte/server.render(App, { props })`** — sync if no top-level `await`, async (`PromiseLike` resolves) when components contain `await` expressions or `<svelte:boundary pending>`
- **`svelte.hydrate(App, { target, props })`** — separate function in Svelte 5. **`mount(App, { hydrate: true })` does NOT exist** in Svelte 5 (that was the deprecated Svelte 4 compat surface via `asClassComponent`)
- **`head` injection** — `RenderOutput.head` carries `<svelte:head>` content from rendered components; the server splices it into the `<!--ssr-head-->` placeholder ahead of the body
- **Per-request `cloneRouter()`** — guard plugins (`canActivate`) read deps via `cloneRouter(base, { currentUser })`, identical to other adapters
- **`@real-router/browser-plugin` only on the client** — never registered in `entry-server.ts` (it touches `globalThis.history`/`window.location`)
- **Snippet-based `RouteView`** — Svelte 5 named snippets matching route segments. `notFound` and `self` are reserved slot names
- **Loader-driven HTTP semantics** — typed loader errors (`LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout` in `src/_loader-errors.ts`) are caught by `renderPage()` and mapped to `301/302`, `404`, and `504` responses respectively. `users.profile` throws `LoaderNotFound` for unknown ids → 404 (vs `UNKNOWN_ROUTE` which is a 200 + NotFound page). `legacyUser` (`/legacy-user/:id`) throws `LoaderRedirect("/users/:id", 301)` — the canonical-URL pattern. `slow` (`/slow`) demonstrates `withTimeout()` — sleeps 5 s but is wrapped in a 250 ms budget, so server responds 504 instead of hanging an SSR worker.
- **`createSubscriber` (Svelte 5 reactive primitive)** — `src/utils/clock.svelte.ts` wraps a `setInterval` subscription via `createSubscriber` and exposes a reactive accessor. SSR ships the server's initial timestamp; after hydration the subscriber sets up the interval lazily (only when read inside an effect/template) and Svelte updates the DOM each tick. The canonical Svelte 5 way to integrate `subscribe(callback)` APIs (websocket, IntersectionObserver, MediaQueryList) into the reactivity graph — analogous to React's `useSyncExternalStore` and Solid's `createResource`. Exercised on the home page.
- **`SvelteSet` (reactive Set wrapper)** — `UsersList.svelte` uses `new SvelteSet<string>()` for selection state. Mutations via `.add()` / `.delete()` notify the reactivity graph so `selected.size` re-renders without immutable replacement. Same family as `SvelteMap`, `SvelteDate`, `SvelteURL`, `SvelteURLSearchParams`. Client-only state — never serialized to SSR (selection starts empty after hydration regardless of server).

## Architecture

```
Server (per request):
  cloneRouter(base, { currentUser })
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                   # critical data resolved
    → await render(App, { props: { router } })     # PromiseLike covers sync + async paths
    → { head, body, hashes }                       # head includes <svelte:head> contributions
    → serializeRouterState(state) → __SSR_STATE__
    → cleanup() (router.dispose() in finally)

Client (initial hydration):
  createAppRouter({ currentUser })
    → usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__)  # rebuilds state via start(state.path)
    → hydrate(App, { target: #root, props: { router } })
                                                   # claims SSR'd DOM, attaches handlers
                                                   # browser-plugin handles SPA nav after this
```

## Svelte-Specific Gotchas

- **`hydrate` ≠ `mount`.** Svelte 5 ships them as separate top-level exports of `svelte`. `hydrate(App, { target, props })` claims existing DOM; `mount(App, { target, props })` mounts fresh. There is **no** `mount({ hydrate: true })` option in Svelte 5 — that's the deprecated Svelte 4 compat surface via `asClassComponent`. Mixing them produces silent mismatches that look like flicker
- **`render()` is `PromiseLike` even for sync components.** `RenderOutput = SyncRenderOutput & PromiseLike<SyncRenderOutput>` — the same call returns a sync object you can read directly *and* a thenable you can `await`. Using `await render(App, …)` covers both sync and async (top-level `await`, `<svelte:boundary pending>`) paths uniformly
- **`<svelte:head>` content lands in `RenderOutput.head`.** Components can declaratively contribute to `<head>` via `<svelte:head>` blocks; `render()` collects them into the `head` field. The server splices it through `<!--ssr-head-->` so per-page titles, meta tags, and link rels survive SSR. This is the Svelte alternative to manual `meta.ts` injection
- **Composables return `{ current: T }` getters, not `Ref`/`Accessor`.** Read inside reactive contexts (template, `$derived`, `$effect`). Reading `.current` outside a reactive scope still returns the snapshot but doesn't register a subscription
- **`getContext` must be called during component init.** All composables (`useRoute`, `useNavigator`, etc.) wrap `getContext()` and throw if called inside `$effect`, event handlers, or async callbacks. The `RouterProvider` must wrap consumers — App.svelte does this
- **`<Lazy>` ≠ SSR data.** `<Lazy>` uses `$effect` to start its loader, and `$effect` does not fire on the server — so SSR renders **only** the fallback. For SSR-critical data, use `state.context.data` (via `ssr-data-plugin`) or a top-level `await` in `<script>`
- **Snippet names must be valid JS identifiers and match route segments exactly.** `notFound` and `self` are reserved by `RouteView` (see `RESERVED_SLOT_NAMES`). Use `userProfile`, not `user-profile`

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # svelte-check + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## Mapping Loader Errors to HTTP

`renderPage()` in `src/entry-server.ts` inspects the `code` field of any error thrown out of `router.start()`:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates → 500 with `<server-error>` body  |

Trade-offs:
- The `404`/`504` bodies are plain text rather than the SSR-rendered NotFound page. Rendering a rich 404 would require a second `render()` pass with a different URL — kept simple in this demo.
- `withTimeout()` doesn't cancel the underlying loader work — only races the response. For real workloads, pair the timeout with `AbortController` in the loader.

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server/index.ts` adds three production-grade pieces on top of the basic SSR wiring:

- **Strong `ETag`** — sha256 of the final HTML bytes, truncated to 16 base64url chars. Identical inputs yield identical hashes; conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. The home page includes a live clock and intentionally invalidates between requests — that's the honest signal that ETag is content-derived, not random.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60`, `/users/:id` → `public, max-age=120`, `/dashboard` and `/admin` → `private, no-store`, `/legacy-user/:id` → 1-day cache for the redirect itself, `/slow` and `/boom` → `no-store`.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the `slow` loader pulls the signal via `getDep("abortSignal")` and clears its `setTimeout`. Without this wiring a 5 s loader holds the worker even after the client gives up. The e2e suite verifies the server releases the handler within 1 s (well under the 5 s loader delay).

These are demonstrated end-to-end by 4 dedicated tests in `e2e/ssr.spec.ts` (Cache-Control routing, 304 on identical content, ETag invalidation across requests, AbortController fast release).

## CSR-only contract is verified by network spy

The e2e suite verifies the `ssr-data-plugin` contract (intercepts `start()`, not `navigate()`) with two assertions: (1) the DOM ends up showing the "User not found" branch after a CSR click, and (2) Playwright's `page.on("request")` confirms zero new HTML/document/fetch/xhr requests during the click — the data really did NOT come from a server roundtrip.

## E2e

[`e2e/ssr.spec.ts`](e2e/ssr.spec.ts) — 43 Playwright scenarios:

- 25 baseline (per-request isolation, hydration round-trip, loaders, guards, query params, nested loaders, 404, 500, CSR navigation, `<Link>` href in no-JS mode)
- Svelte-specific: no hydration mismatch warnings (Svelte 5 emits `[svelte] hydration_*` warnings on mismatch)
- **`<svelte:head>` per-route**: home page ships per-route `<title>` + `<meta description>` in raw SSR HTML; `/users` reflects the current `?sort` param via reactive `<svelte:head>`
- **Loader-driven HTTP**: `/users/9999` → 404, `/users/9999/posts` → 404, `/legacy-user/2` → 301 + Location, `/legacy-user/3` follows to a hydrated profile, `/slow` → 504 within 2.5 s budget (5 s loader delay)
- **CSR navigate spy**: clicking a profile link triggers zero document/fetch requests; `state.context.data` stays undefined
- **Query params in `__SSR_STATE__`**: `?sort=desc` surfaces in the serialized blob
- **Mixed-guard concurrent requests**: admin / user / anon contexts × 5 routes (admin, dashboard, users, profile, posts) in parallel — each context sees only its own `currentUser`
- **Cache-Control + ETag + AbortController** (4 tests): per-route Cache-Control directives match `src/router/cache-policies.ts`; `/users` 304 on conditional GET; `/` clock invalidates ETag between requests; `/slow` releases the handler in <1 s when the client disconnects (vs the 5 s loader delay)

## See Also

- [`@real-router/svelte`](../../../../../packages/svelte)
- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/vue/ssr-examples/ssr`](../../../vue/ssr-examples/ssr) — Vue counterpart with the same e2e contract
- Svelte docs: [`render`](https://svelte.dev/docs/svelte/svelte-server), [`hydrate`](https://svelte.dev/docs/svelte/imperative-component-api), [`<svelte:head>`](https://svelte.dev/docs/svelte/svelte-head)
