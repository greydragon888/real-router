# SSR Streaming Vue Example

> Real-Router with Vue 3 streaming SSR — `renderToWebStream` + `<Suspense>` + `async setup()` — and **zero router-specific streaming API**.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before shell renders
- **Vue 3 native streaming** via `vue/server-renderer.renderToWebStream` — server emits HTML chunks as the render tree resolves
- **`<Suspense>` + `async setup()`** for deferred sections (reviews, related items) that render in via Vue's chunked SSR pipeline
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — client hydration is instant via `Promise.resolve()`
- **Full-reload navigation** via `<Link>` falling back to native `<a href>` (no `browser-plugin`) — every navigation is a fresh SSR render

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

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vue-tsc + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright — 9 acceptance scenarios
```

## E2e Scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 9 Playwright scenarios mirroring the React example where the runtime allows:

1. **Shell renders before deferred content** — `page.goto(..., { waitUntil: "commit" })` + critical content visible quickly
2. **Streaming response contains resolved deferred content** — HTTP-level test verifying the streamed HTML contains both reviews and related sections
3. **Deferred sections render after critical content** — browser visibility check
4. **No hydration errors** — console clean of `hydrat`/`mismatch` warnings after stream completes
5. **Every page is server-rendered with streaming** — full-reload navigation, fresh SSR per visit
6. **Critical loader data lands in `__SSR_STATE__` inline script** — round-trip via `serializeRouterState`
7. **Per-request isolation under 9 concurrent loads** — `cloneRouter()` integrity
8. **Deferred section data arrives in stream chunks** — verifies Suspense child markup is present in the response body
9. **Suspense error containment** — `onErrorCaptured` catches a rejected Reviews fetch on hydration without affecting siblings

Note: there is no Vue equivalent of React's `<!--$?-->` Suspense placeholder marker test, because Vue does not emit out-of-order placeholders.

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
