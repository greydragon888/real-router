# Streaming SSR Preact Example

> Real-Router with Preact 10 streaming SSR — `preact-render-to-string@6.6.7`'s `renderToReadableStream` over `Transfer-Encoding: chunked`.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before shell renders
- **Preact 10 streaming primitive** — `renderToReadableStream` from `preact-render-to-string/stream` (since 6.5.x, Jan 2025)
- **HTTP-level streaming** — Express server pipes the readable-stream chunks; `Transfer-Encoding: chunked` confirmed in response headers
- **Per-request `cloneRouter`** — each request gets an isolated router, disposed in `finally`
- **Typed `LoaderNotFound`** — short-circuits to plain-text 404 BEFORE constructing the stream (no leak)
- **Per-route `Cache-Control`** — applies to streaming responses too

## Honest divergence from React 19 streaming

This example demonstrates what Preact 10 streaming SSR **actually can do**, with honest divergences from React 19 documented:

| React 19 feature | Preact 10 status | This example's approach |
|---|---|---|
| `renderToReadableStream` Web Stream output | ✅ since `preact-render-to-string@6.5.x` | **Used** as the pipeline |
| `<Suspense>` + `lazy()` + dynamic import for code-split streaming | ✅ since `@6.6.x` (out-of-order via `<preact-island>` custom element) | **Used** for the specs section — see below |
| `<Suspense>` + `use(promise)` for in-component data deferral | ❌ no `use(promise)` hook | Sibling sections (Reviews, RelatedItems) are sync-rendered from fixtures |
| Async function components inside `<Suspense>` (server-only render) | ⚠️ empirically: renderer treats async returns as undefined and silently skips | Not used; sync siblings instead |
| Selective hydration on individual islands | ⚠️ partial — out-of-order signature exists for `lazy()`; v11 promises broader story | `<preact-island>` swaps fallback → resolved on the client |

### Out-of-order streaming with `<preact-island>` custom element

When `<Suspense fallback={…}><Lazy /></Suspense>` is rendered with `renderToReadableStream`, Preact emits:

1. `<!--preact-island:-N-->` open marker + the inline fallback HTML.
2. `<!--/preact-island:-N-->` close marker, then the rest of the page shell.
3. Once the dynamic import resolves: a trailing `<div hidden>` with a small bootstrap `<script>` that defines a `<preact-island>` custom element, plus `<preact-island hidden data-target="-N">…resolved content…</preact-island>`.
4. The custom element's `connectedCallback` removes the fallback nodes between the markers and inserts the resolved children in their place — without any framework intervention.

This is functionally equivalent to React 19's `<!--$?-->` placeholder + `<template id="B:0">` mechanism, just with a different wire signature. **Verified end-to-end by 4 dedicated e2e tests** in `e2e/ssr-streaming.spec.ts`:
- Resolved specs section is present in the streamed HTML.
- Fallback presence ↔ bootstrap script presence (consistency invariant).
- Vite emits `ProductSpecs` as a separate client chunk under `dist/client/assets/`.
- Post-hydration DOM contains the resolved specs.

### Module-cache caveat (the same pitfall React docs warn about)

`lazy(() => import("./X"))` caches the resolved module at module scope. The fallback is therefore emitted **only on the first SSR after server start**; subsequent renders see the cached module synchronously and skip the fallback entirely. This is identical to `React.lazy`'s behaviour and the reason the React streaming guide recommends `useMemo`-per-render promises for visible-on-every-request streaming.

The e2e suite asserts what holds **regardless of cache state** (resolved content present, code-split chunk on disk, fallback↔bootstrap consistency) plus filesystem-level proof that code-splitting really happened. We deliberately do not assert "fallback is always present" — that would be flaky against the cache.

### What's still beyond Preact 10

- **`use(promise)` for in-component data deferral** — design gap; v11 may add. Workaround: pre-resolve via `ssr-data-plugin` (which this example does for critical product data).
- **True selective hydration of arbitrary Suspense boundaries** — only `lazy()` boundaries get the `<preact-island>` swap; broader story lands in v11.
- **Async function components** — silent skip in `renderToReadableStream`; do not use them in Preact 10 streaming pipelines.

## Architecture

```
server/
  dev.ts              Express + Vite middleware (HMR), pipes stream to res
  index.ts            Express production server, pipes stream + Cache-Control
src/
  database.ts         In-memory mock store (products only)
  entry-server.tsx    render(url) → { stream?, ssrJson, statusCode, cleanup, rawBody? }
  entry-client.tsx    hydrateRouter() + Preact hydrate()
  App.tsx             Shared component tree
  components/
    ProductsList.tsx  Product list (renders state.context.data.products)
    ProductDetail.tsx Detail page (Reviews + RelatedItems + lazy ProductSpecs)
    Reviews.tsx       Sync component reading module-level fixture
    RelatedItems.tsx  Sync component reading module-level fixture
    ProductSpecs.tsx  Loaded via lazy(() => import(…)) — separate chunk, code-split streaming
  pages/
    Home.tsx, NotFound.tsx
  router/
    routes.ts, loaders.ts, cache-policies.ts, createAppRouter.ts
```

## Streaming flow

```
Server (per request):
  cloneRouter(base)
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                  # critical data resolved
    → renderToReadableStream(<RouterProvider><App /></RouterProvider>)
                                                  # ReadableStream<Uint8Array>
  Express:
    → write(template-head)                        # immediate
    → for each chunk: response.write(chunk)       # streaming
    → write(template-tail + __SSR_STATE__ script) # final
    → response.end()
    → cleanup() — router.dispose() runs in finally

Client:
  createAppRouter()
    → usePlugin(ssrDataPluginFactory(loaders))
    → hydrateRouter(router, window.__SSR_STATE__) # deposits parsed state in scratchpad, calls start(state.path)
                                                  # ssr-data-plugin reads context.data from scratchpad (#596) — loader skipped
    → hydrate(<RouterProvider><App /></RouterProvider>, root)
```

**Post-hydration loader skip (#596).** `hydrateRouter()` deposits the parsed `__SSR_STATE__` into a one-shot scratchpad on `RouterInternals.hydrationState` before `router.start(state.path)`. `ssr-data-plugin`'s start interceptor reads the scratchpad and writes the server-resolved value to `state.context.data` directly, skipping the loader call. Result: zero loader-driven calls on first paint after hydration. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts).

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright — 6 acceptance scenarios
```

## E2e scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts):

1. Home page server-rendered with SSR state script
2. Products list renders with critical loader data
3. Product detail streams shell + sibling sections
4. **`Transfer-Encoding: chunked`** present in response headers — empirical proof of streaming
5. 404 for unknown product id (typed `LoaderNotFound` short-circuits)
6. Hydration completes without console errors

## Loader-driven HTTP

`@real-router/ssr-data-plugin/errors` exports `LoaderNotFound`. The `products.detail` loader throws it for unknown ids; `entry-server.tsx` catches BEFORE the stream is constructed and returns a plain-text 404 result. Without this typed-error path, a generic throw would bubble past the streaming pipeline's catch site and skip `cleanup()` — leaking the per-request router until GC.

## Required: `resolve.dedupe` for Preact

`vite.config.ts` pins `resolve.dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"]` — required to avoid two-copies-of-preact in the bundle. See [`../ssr/README.md`](../ssr/README.md#required-resolvededupe-for-preact-in-monorepo-vite-configs) for the full explanation; same fix lands in all three SSR examples.

## See Also

- [`../ssr/`](../ssr) — classical Preact SSR (sync `renderToString`), full feature parity with React equivalent
- [`../ssg/`](../ssg) — build-time pre-rendering
- [`../../../react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 reference with `use(promise)` + selective hydration
- [Preact SSR Guide v10](https://preactjs.com/guide/v10/server-side-rendering/) — official docs noting v10 hydration limits
- [`preact-render-to-string` releases](https://github.com/preactjs/preact-render-to-string/releases) — streaming added in 6.5.x
