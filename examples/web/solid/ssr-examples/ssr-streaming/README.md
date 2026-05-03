# SSR Streaming Solid Example

> Real-Router with Solid streaming SSR — `renderToStream` + `<Suspense>` + `createResource` + `<ErrorBoundary>` — and **zero router-specific streaming API**.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before the shell renders
- **Solid native streaming** via `solid-js/web.renderToStream` — true out-of-order placeholders + selective hydration, the same model as React 19
- **`<Suspense>` + `createResource`** for deferred sections (reviews, related items) that ship as separate `<template id="...">` chunks once the resource resolves
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — client hydration is instant via `Promise.resolve()`
- **`<ErrorBoundary>` first-class** — `Reviews` is wrapped in `ErrorBoundary + Suspense`; a rejected promise renders the fallback without affecting siblings
- **No `browser-plugin`** — each direct page load (typed URL, browser refresh, deep link, `page.goto()`) triggers a fresh streamed render. `<Link>` components emit correct `<a href>` HTML for crawlers and modifier-key clicks

The router does **nothing streaming-specific**. All streaming behaviour comes from Solid's native `<Suspense>` + `renderToStream` + `createResource`. Real-Router's role is identical to non-streaming SSR: per-request `cloneRouter()`, `start(url)`, plugin-driven critical data via `state.context.data`.

## How This Differs From Other Adapters

| | React 19 | Vue 3 | **Solid** |
| --- | --- | --- | --- |
| Streaming primitive | `renderToReadableStream` + `<Suspense>` | `renderToWebStream` + `<Suspense>` | `renderToStream` + `<Suspense>` |
| Out-of-order placeholders | Yes (`<!--$?-->`) | No (sequential, blocking Suspense) | Yes (`<template id="...">` chunks) |
| Selective hydration | Yes — hydrates resolved islands as chunks arrive | No — `app.mount()` hydrates the whole tree atomically | Yes — `_$HY` injects per-island patches |
| `<Suspense>` semantics in SSR | Non-blocking, fallback first | Blocking, real content first | Non-blocking, fallback first |
| Hydration script | Auto via `renderToReadableStream` | Inline markers | **`generateHydrationScript()` is mandatory** in `<head>` |

Solid's streaming model is the closest non-React analogue: the server emits a fallback marker for every Suspense boundary, then the resolved chunk arrives in a later HTTP frame and a tiny inline script swaps the placeholder for the real subtree. Hydration is selective — the shell becomes interactive before deferred sections finish.

## Architecture

```
Server (per request):
  cloneRouter(base)
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                   # critical data resolved (sync product)
    → generateHydrationScript()                    # injected into <head> BEFORE stream chunks
    → renderToStream(<RouterProvider><App /></RouterProvider>, {
        onCompleteAll: () => writer.close() + cleanup(),
      })
    → pipe(NodeWritable) writes UTF-8 bytes through TextEncoder/TransformStream
                                                   # chunks emitted as <Suspense> children resolve
    → router.dispose() (idempotent via `disposed` guard, fires from onCompleteAll)

Client (initial hydration only):
  createAppRouter()
    → usePlugin(ssrDataPluginFactory(loaders))     # re-runs critical loader on hydration
    → hydrateRouter(router, window.__SSR_STATE__)  # rebuilds state via start(state.path)
    → hydrate(() => <RouterProvider><App /></RouterProvider>, #root)
                                                   # claims streamed DOM, attaches handlers
                                                   # createResource(...) returns Promise.resolve() on client
                                                   # → no flash, no re-fetch
```

## Solid-Specific Gotchas

- **`generateHydrationScript()` is mandatory.** Without it, `_$HY` is undefined and the streamed `<template id="...">` chunks have nothing to splice into. Server returns `hydrationScript` as a separate `RenderResult` field; the Express layer injects it ahead of the body stream
- **`pipe(NodeWritable)`, not `pipeTo(WritableStream)`.** The example wires `pipe()` (Node-shape `{ write(chunk: string) }`) into a `TransformStream<Uint8Array>` via `TextEncoder` so the server reads chunks the same way as Vue's `renderToWebStream`. `pipeTo()` would force a `Readable.fromWeb` round-trip
- **`<ErrorBoundary>` over `<Show fallback>`.** Async errors (e.g. rejected `createResource`) propagate up through `<Suspense>`. `<Show fallback={<…>}>` is conditional rendering, **not Suspense-aware** — using it for an async fallback would never catch the error
- **`createResource(() => props.id, fetcher)`** — the accessor is the source key; Solid re-runs the fetcher when it changes. Inside `<Suspense>`, the boundary pauses until the resource resolves
- **External `<Suspense>` only.** [`packages/solid/src/components/RouteView/helpers.tsx`](../../../../../packages/solid/src/components/RouteView/helpers.tsx) wraps `Match`/`Self` in `<Suspense>` only when a `fallback` prop is passed. The streaming demo passes `fallback` to `<Suspense>` directly inside components (not on `RouteView.Match`), which avoids accidental double-wrapping
- **Top-level `<Show>` for UNKNOWN_ROUTE.** Same hk-counter divergence pattern as `examples/web/solid/ssr-examples/ssr/` — `<RouteView.NotFound>` as a sibling to multiple `<RouteView.Match>` blocks triggers a hydration mismatch in vite-plugin-solid 2.11.x. The streaming example uses an app-level `<Show when={!isUnknown} fallback={<NotFound />}>` for the same reason

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # tsc + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## E2e Coverage

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — Playwright suite mirroring the Vue baseline where the runtime allows, plus Solid-specific OOO scenarios:

- Cross-cutting (404, per-request isolation, no hydration warnings, critical data round-trip, deferred section visibility) — same as Vue
- Solid-specific: `<template id="...">` chunks present in the streamed HTML (proof of OOO splice points)
- Solid-specific: `_$HY` runtime variable injected via `generateHydrationScript()`
- Solid-specific: fallback markers (`reviews-fallback`, `related-fallback`) appear in the initial chunk and are replaced after the resource resolves — Solid's OOO model **expects** the fallback to ship first, unlike Vue's blocking Suspense
- **Removed from Vue baseline:** scenario "critical content precedes deferred sections" — Solid's OOO model can deliver deferred content out of source order, so the positional invariant does not hold
- **Removed from Vue baseline:** "no fallback flicker" — Solid's OOO model intentionally ships fallbacks first; the inverse (`reviews-section` is eventually visible) is asserted instead

## Why No `<Await>` / `defer()` Wrapper API?

Real-Router intentionally does **not** ship a `<Await>` component or `defer()` helper. Solid's `<Suspense>` + `createResource` + `<ErrorBoundary>` already provides the same ergonomics with one less abstraction layer.

```tsx
<ErrorBoundary fallback={(err) => <p>Error: {err.message}</p>}>
  <Suspense fallback={<Spinner />}>
    <DataView productId={data.product.id} />
  </Suspense>
</ErrorBoundary>
```

## Library Philosophy

This example demonstrates Real-Router's library-first stance: **delegate to Solid native primitives instead of inventing router-specific streaming APIs**. The `<Suspense>` boundary, `createResource`, and `renderToStream` form the complete streaming SSR contract that Solid ships — the router just provides per-request isolation and per-route critical data.

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 counterpart with the same OOO Suspense model
- [`examples/web/vue/ssr-examples/ssr-streaming/`](../../../vue/ssr-examples/ssr-streaming) — Vue 3 counterpart with blocking SSR Suspense
- Solid docs: [`renderToStream`](https://docs.solidjs.com/reference/rendering/render-to-stream), [`<Suspense>`](https://docs.solidjs.com/reference/components/suspense), [`createResource`](https://docs.solidjs.com/reference/basic-reactivity/create-resource), [`<ErrorBoundary>`](https://docs.solidjs.com/reference/components/error-boundary)
