# SSR Streaming Vue Example

> Real-Router with Vue 3 streaming SSR — `renderToWebStream` + `<Suspense>` + `async setup()` — and **zero router-specific streaming API**.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before shell renders
- **Vue 3 native streaming** via `vue/server-renderer.renderToWebStream` — server emits HTML chunks as the render tree resolves
- **`<Suspense>` + `async setup()`** for deferred sections (reviews, related items) that render in via Vue's chunked SSR pipeline
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — client hydration is instant via `Promise.resolve()`
- **No `browser-plugin`** — each direct page load (typed URL, browser refresh, deep link, `page.goto()`) triggers a fresh SSR render with full streaming. `<Link>` components emit correct `<a href>` HTML for crawlers and modifier-key clicks (Cmd/Ctrl/middle-click → new tab). Normal left-clicks are intercepted by the adapter (`evt.preventDefault()` + `router.navigate()`) but without `browser-plugin` the URL never changes — the demo intentionally focuses on the SSR streaming pipeline rather than post-hydration CSR. For full SPA navigation on top of streaming SSR, layer `browser-plugin` on top (see [`ssr/`](../ssr) for the pattern).

The router does **nothing streaming-specific**. All streaming behavior comes from Vue 3's native `<Suspense>` + `renderToWebStream` + `async setup()`. Real-Router's role is identical to non-streaming SSR: per-request `cloneRouter()`, `start(url)`, plugin-driven critical data via `state.context.data`.

## How This Differs From React `ssr-streaming`

Vue 3 SSR streaming is **structurally different** from React 19's `renderToReadableStream`:

| | React 19 | Vue 3 |
| --- | --- | --- |
| Streaming primitive | `renderToReadableStream` + `<Suspense>` | `renderToWebStream` + `<Suspense>` |
| Out-of-order placeholders | Yes — `<!--$?-->` markers + `<template>` chunks replace them as they resolve | No — render is sequential, top-down |
| Selective hydration | Yes — hydrates resolved islands as chunks arrive | No — `app.mount()` hydrates the whole tree atomically |
| `<Suspense>` semantics in SSR | Non-blocking — emits fallback marker, real content follows in a later chunk | Blocking — render of content **after** the boundary waits for async children to resolve |

What this example actually demonstrates for Vue:

- **Chunked streaming of the rendered output** — Vue emits HTML as the render tree resolves rather than buffering everything; you get real `Transfer-Encoding: chunked` behavior and improved TTFB compared to `renderToString`
- **`<Suspense>` boundaries with `async setup()`** — used as the canonical Vue pattern for awaitable deferred data
- **Per-request router isolation** under concurrent load — same guarantee as the React example

It does **not** demonstrate React's "fallback now, real content later" pattern, because Vue 3 doesn't ship that pattern in the stable runtime. True out-of-order hydration is on the Vapor mode roadmap; until then, this example demonstrates Vue 3's actual SSR streaming model honestly.

## Architecture

```
Server (per request):
  cloneRouter(base)
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                  # critical data resolved (sync product)
    → renderToWebStream(<RouterProvider><App /></RouterProvider>)
                                                  # render starts as critical data is ready
    → pipe stream chunks to res                   # chunks emitted as <Suspense> children resolve
    → cleanup()                                   # router.dispose() after stream completes

Client (initial hydration only):
  createAppRouter()
    → usePlugin(ssrDataPluginFactory(loaders))    # re-runs critical loader on hydration
    → hydrateRouter(router, window.__SSR_STATE__) # rebuilds state via start(state.path)
    → createSSRApp(...).mount("#root")            # claims streamed DOM, attaches handlers
                                                  # async setup with Promise.resolve() returns sync — no flash
```

## Streaming Pattern

The deferred Suspense components own their own data fetching with **environment-aware delays**:

```vue
<script setup lang="ts">
const SERVER_REVIEWS_DELAY_MS = 600;

function fetchReviews(productId: string): Promise<Review[]> {
  if (typeof globalThis.window === "undefined") {
    return new Promise((resolve) => {
      setTimeout(() => resolve(REVIEWS_BY_PRODUCT[productId]), SERVER_REVIEWS_DELAY_MS);
    });
  }
  return Promise.resolve(REVIEWS_BY_PRODUCT[productId]);
}

const props = defineProps<{ productId: string }>();
const reviews = await fetchReviews(props.productId); // top-level await in <script setup>
</script>
```

Wired up via `<Suspense>` in the parent:

```vue
<Suspense>
  <Reviews :productId="data.product.id" />
  <template #fallback>
    <p data-testid="reviews-fallback">Loading reviews…</p>
  </template>
</Suspense>
```

Key constraints:

- **Top-level `await` in `<script setup>`** — Vue makes the component async; `<Suspense>` boundary is required to render it
- **Server delay via `setTimeout`** simulates slow data sources without external services
- **Client returns `Promise.resolve(value)`** — `await` resolves synchronously on the next microtask, no hydration flash
- **`onErrorCaptured` is the boundary** — `ReviewsErrorBoundary.vue` returns `false` from the hook to stop propagation, mirroring React's `componentDidCatch`

## `<Teleport>` modal — streaming-safe portal pattern

`src/components/ProductSpecsModal.vue` demonstrates Vue 3's `<Teleport>`: a button declared inside `<ProductDetail>` that mounts its dialog into `#modal-target` (a sibling of `#root` in `index.html`), not inside the article that hosts the trigger. Standard portal pattern — declared in one tree, rendered in another.

The implementation uses the canonical streaming-safe variant: `<Teleport :disabled="!mounted">` paired with `onMounted(() => mounted.value = true)`. The reason is hydration consistency:
- Server-side, `mounted = false` → `<Teleport>` is disabled → content (if any) renders inline at the declared site.
- Client-side, `onMounted` fires AFTER hydration, flips `mounted`, the teleport activates, and any open content moves to `#modal-target`.

Without `:disabled`, Vue's SSR Teleport emits placeholder markers that the streaming pipeline + hydration walker don't always match precisely — triggering `Hydration completed but contains mismatches.` This pattern is the recommended escape hatch.

Verified by Scenarios 15 (closed modal contributes zero markup to streamed HTML, target node exists) and 16 (after click, dialog lives inside `#modal-target` and NOT inside `#root`).

## Loader-driven HTTP: typed LoaderNotFound for unknown ids

`src/_loader-errors.ts` defines `LoaderNotFound` (same shape as the runtime SSR example). The `products.detail` loader throws it for ids not in the in-memory store; `entry-server.ts` catches the typed error BEFORE constructing the stream and returns a plain-text 404 result. This fixes a leak in the previous design — a generic `throw new Error()` bubbled past the streaming pipeline's catch path, `cleanup()` was never called, and the per-request router was held until GC. Now the catch path always disposes.

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain, no streaming)   |
| anything else      | propagates → `next(error)` (Express default) |

The error path bypasses the streaming pipeline entirely — `Transfer-Encoding: chunked` is absent, no `<Suspense>` fallback flicker, just a fast plain-text response. Verified by Scenario 15.

## Production HTTP semantics: Cache-Control + AbortController (no ETag)

`server/index.ts` adds two production-grade pieces tailored to streaming:

- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, s-maxage=3600`, `/products` → `public, max-age=60`, `/products/:id` → `public, max-age=120`.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the stream-pump loop checks `signal.aborted` between `reader.read()` calls and bails out via `reader.cancel()`. Cleanup (`router.dispose()`) runs in the `finally` block. Without this, a client disconnect would let the server keep pulling chunks from the ReadableStream until completion (~1200 ms for `/products/:id` due to RelatedItems' Suspense delay).

**ETag is intentionally absent.** Strong ETag requires hashing the full body; a streaming pipeline never holds the body in memory as a single buffer, so adding ETag would mean buffering the whole stream first — which defeats streaming. Production setups typically rely on CDN-level shared caching (`s-maxage`) plus the CDN's own buffered ETag layer applied at the edge. See `src/router/cache-policies.ts` for the full rationale.

These are demonstrated end-to-end by Scenarios 15 (Cache-Control routing), 16 (no-ETag honesty check), and 17 (AbortController mid-stream release).

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vue-tsc + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright — 14 acceptance scenarios
```

## E2e Scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 14 Playwright scenarios mirroring the React example where the runtime allows, plus four Vue-specific invariants the React equivalent does not exercise:

1. **Shell renders before deferred content** — `page.goto(..., { waitUntil: "commit" })` + critical content visible quickly
2. **Streaming response contains resolved deferred content** — HTTP-level test verifying the streamed HTML contains both reviews and related sections
3. **Deferred sections render after critical content** — browser visibility check
4. **No hydration errors** — console clean of `hydrat`/`mismatch` warnings after stream completes
5. **Every page is server-rendered with streaming** — full-reload navigation via `page.goto()`, fresh SSR per visit
6. **Critical loader data lands in `__SSR_STATE__` inline script** — round-trip via `serializeRouterState`
7. **Per-request isolation under 9 concurrent loads** — `cloneRouter()` integrity
8. **Deferred section data arrives in stream chunks** — verifies Suspense child markup is present in the response body
9. **Suspense error containment** — `onErrorCaptured` catches a rejected Reviews fetch on hydration without affecting siblings
10. **404 fallback** — unknown routes return 404 status with the NotFound page rendered through the streaming pipeline
11. **Critical content precedes deferred sections** — positional invariant: resolved critical HTML appears in the response BEFORE the `<Suspense>`-rendered sections (Vue's blocking SSR Suspense is enforced)
12. **Chunked transfer + per-Suspense timing** — `Transfer-Encoding: chunked` is set, `Content-Length` is absent, and body delivery wall-clock ≥ slowest Suspense delay (≥1100ms) — proves the response is genuinely streamed, not buffered
13. **Empty deferred state** — when reviews/related-items resolve to `[]`, empty-state UI renders without errors and without hydration warnings
14. **No hydration flicker** — server-rendered Suspense content is immediately present after commit; `reviews-fallback` / `related-fallback` markers never appear in the DOM (consequence of Vue's blocking SSR Suspense)

Note: there is no Vue equivalent of React's `<!--$?-->` Suspense placeholder marker test, because Vue does not emit out-of-order placeholders. Scenarios 11, 12, and 14 are the Vue-specific surrogates that pin down the actual streaming + blocking-Suspense contract.

## Why No `<Await>` / `defer()` Wrapper API?

Real-Router intentionally does **not** ship a `<Await>` component or `defer()` helper. Vue 3's `<Suspense>` + `async setup()` already provides the same ergonomics with one less abstraction layer.

```vue
<!-- Real-Router (just Vue 3 native) -->
<Suspense>
  <DataView :promise="dataPromise" />
  <template #fallback><Spinner /></template>
</Suspense>

<script setup lang="ts">
const props = defineProps<{ promise: Promise<Data> }>();
const data = await props.promise;
</script>
```

## Library Philosophy

This example demonstrates Real-Router's library-first stance: **delegate to Vue 3 native primitives instead of inventing router-specific streaming APIs**. The `<Suspense>` boundary, `async setup()`, and `renderToWebStream` form the complete streaming SSR contract that Vue ships — the router just provides per-request isolation and per-route critical data.

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin) — per-route critical data loading
- [`examples/web/react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 counterpart with out-of-order Suspense placeholders
- Vue 3 docs: [`renderToWebStream`](https://vuejs.org/api/ssr.html#rendertowebstream), [`<Suspense>`](https://vuejs.org/guide/built-ins/suspense.html), [`async setup()`](https://vuejs.org/api/composition-api-setup.html#async-setup)
