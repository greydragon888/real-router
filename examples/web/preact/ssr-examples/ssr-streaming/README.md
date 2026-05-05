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

This example is **deliberately scaled down** vs `examples/web/react/ssr-examples/ssr-streaming/`. React 19's flagship streaming features depend on primitives Preact 10 lacks:

| React 19 feature | Preact 10 status | This example's approach |
|---|---|---|
| `<Suspense>` + `use(promise)` for in-component data deferral | ❌ no `use(promise)` hook | Sibling sections are sync-rendered from fixtures |
| Out-of-order Suspense placeholders + selective hydration | ❌ docs note "hydration that can pause and wait for JS chunks. Solved in upcoming Preact v11" | Single in-order render |
| Async function components inside `<Suspense>` (server-only render) | ⚠️ tested empirically — silent skip; renderer treats async returns as undefined | Components are plain sync functions |
| `renderToReadableStream` Web Stream output | ✅ supported since `preact-render-to-string@6.5.x` | **Used here** for the streaming pipeline |

What's left after subtracting unsupported features:
- **Streaming pipeline works** — chunked HTTP transfer, smaller TTFB-relevant byte order
- **Suspense fallback streaming for `lazy()` components** — would work the same way React 19's does, but this demo omits it for parity-of-shape with the React example. Add `lazy(() => import("./Big"))` if you want to see fallback streaming for code-split modules.

If you need true data-deferred Suspense streaming with selective hydration on the client, **use the React adapter** for now. Preact v11 is expected to add `use(promise)` and out-of-order completion; this example will be revisited then.

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
    ProductDetail.tsx Detail page (Reviews + RelatedItems siblings)
    Reviews.tsx       Sync component reading module-level fixture
    RelatedItems.tsx  Sync component reading module-level fixture
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
    → hydrateRouter(router, window.__SSR_STATE__) # rebuild via start(state.path)
    → hydrate(<RouterProvider><App /></RouterProvider>, root)
```

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

## See Also

- [`../ssr/`](../ssr) — classical Preact SSR (sync `renderToString`), full feature parity with React equivalent
- [`../ssg/`](../ssg) — build-time pre-rendering
- [`../../../react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 reference with `use(promise)` + selective hydration
- [Preact SSR Guide v10](https://preactjs.com/guide/v10/server-side-rendering/) — official docs noting v10 hydration limits
- [`preact-render-to-string` releases](https://github.com/preactjs/preact-render-to-string/releases) — streaming added in 6.5.x
