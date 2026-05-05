# SSR Streaming Solid Example

> Real-Router with Solid streaming SSR — `renderToStream` + `<Suspense>` + `createResource` + `<ErrorBoundary>` — and **zero router-specific streaming API**.

> **Progressive enhancement disclaimer.** This example **requires JavaScript** for interactivity. Without JS, the user sees only the streamed shell with `Loading reviews…` / `Loading related items…` placeholders — the deferred content never resolves because Solid's splice scripts (`$df()`) need to execute. The "no-JS reads the full page" property of the classical `ssr/` example does **not** hold here. This is an inherent property of streaming + selective hydration, not a bug. For applications that must work without JS, use the classical `ssr/` mode (full HTML in one buffered response) — the sibling [`examples/web/solid/ssr-examples/ssr/`](../ssr) demonstrates `renderToStringAsync` on the `/async-page` route.

> **Known limitation: `<SuspenseList>` + vite-plugin-solid 2.11.x = hydration mismatch.** Solid's `<SuspenseList revealOrder>` API works at the runtime level — the wire-format chunks ship in coordinated order — but wrapping streaming Suspense boundaries in `<SuspenseList>` makes vite-plugin-solid 2.11.x emit divergent hydration-key counters: the browser logs `Hydration Mismatch. Unable to find DOM nodes for hydration key …` and event handlers on subsequent siblings (e.g. `ProductActions`) silently fail to attach. We tried the wrapping; backed it out (see comment in `ProductDetail.tsx`). Track upstream and revisit once the plugin's hydration-key generator stabilises. Same root cause as the `RouteView.NotFound` workaround in `App.tsx` (top-level `<Show>` guard).

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before the shell renders
- **Solid native streaming** via `solid-js/web.renderToStream` — true out-of-order placeholders + selective hydration, the same model as React 19
- **`<Suspense>` + `createResource`** for deferred sections (reviews, related items) that ship as separate `<template id="...">` chunks once the resource resolves
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — client hydration is instant via `Promise.resolve()`. Exception: id `4` (`Broken Reviews Demo`) intentionally rejects on **both** server and client (`Reviews.tsx:33-37`) — Solid serializes the resolved resource to the client, so an error must originate server-side to ship the `<ErrorBoundary>` fallback in streamed HTML
- **`<ErrorBoundary>` first-class** — `Reviews` is wrapped in `ErrorBoundary + Suspense`; a rejected promise renders the fallback without affecting siblings. `ProductActions` demonstrates the **`reset` callback** path (`fallback={(err, reset) => ...}`) — clicking "Try again" re-attempts the failed branch without remounting the whole tree.
- **No `browser-plugin`** — each direct page load (typed URL, browser refresh, deep link, `page.goto()`) triggers a fresh streamed render. `<Link>` components emit correct `<a href>` HTML for crawlers and modifier-key clicks
- **Loader-driven 404** — `products.detail` loader throws `LoaderNotFound` for unknown ids; `entry-server.tsx` short-circuits the streaming pipeline and sends `404 + text/plain`. Same pattern as `svelte/ssr-streaming` and `angular/ssr` — gives streaming examples a clean way to bail out before the first chunk for missing data.
- **Test fixtures cover all branches** — `database.ts` ships 5 products: ids `1`/`2`/`3` (happy paths with reviews + related items, varying counts), id `4` (`Broken Reviews Demo` — `fetchReviews` rejects, exercises `<ErrorBoundary>` containment server-side and client-side), id `5` (`Niche Cable Tester` — empty review/related lookups, exercises empty-state UI in `Reviews.tsx`/`RelatedItems.tsx`).
- **`onMount` + `isServer` for SSR-safe side effects** — `ProductActions` populates `window.__MOUNT_LOG__` only on the client. Solid's runtime guarantees `onMount` skips on the server, and `isServer` (from `solid-js/web`) is a compile-time constant — DCE removes the body from the SSR bundle. Verified by Scenario 20 (wire response contains zero references to `__MOUNT_LOG__`).
- **Custom `use:` directive (`use:trackView`)** — `src/actions/track-view.ts` registers an `IntersectionObserver` on the product article. Same pattern as Svelte's `use:trackView`. Solid SSR runtime skips action invocations entirely, so the action body can reference DOM-only APIs without crashing render. Note the babel-preset quirk: `trackView` must be **imported** in the consuming module even though TypeScript marks it unused — the babel transform consumes the binding before TS does (workaround in `ProductDetail.tsx`). Verified by Scenarios 23 + 24.

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
    → router.dispose() — idempotent via `disposed: boolean` guard
                          (onCompleteAll AND server-layer `finally { cleanup() }` both call it;
                          only the first call disposes, subsequent calls no-op)

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
- **Double Vite resolve conditions + `noExternal: ["@real-router/solid"]`.** `vite.config.ts` sets `resolve.conditions` AND `ssr.resolve.conditions` to `["@real-router/internal-source", "development"]` — and pins `ssr.noExternal: ["@real-router/solid"]` so the SSR bundler picks up the `.tsx` source from the workspace adapter and recompiles it through `vite-plugin-solid` for the SSR codegen. Without `noExternal`, Vite would import the published `dist/esm/*.js` and the JSX would never reach `babel-preset-solid` — `<Suspense>` boundaries would never produce streaming markers. Symmetric with the sibling `ssr/` example
- **Defensive `<Show fallback>` in `ProductDetail`.** The component wraps its body in `<Show when={data()} fallback={<p data-testid="product-not-found">…</p>}>` even though `LoaderNotFound` short-circuits the pipeline before render — the fallback is a belt-and-braces guard against a misconfigured loader, not a runtime path that fires under normal SSG/SSR flow

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
                  # `predev` hook runs `pnpm turbo run bundle --filter=...`
                  # so workspace deps (@real-router/solid + plugins) are
                  # rebuilt before the dev server starts
pnpm build:app    # tsc + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## E2e Coverage

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 23 Playwright scenarios (numbered 1–20 plus 22–24, with one historical gap at 21):

- 15 baseline (404, per-request isolation, no hydration warnings, critical data round-trip, deferred section visibility, `<template id="…">` OOO chunks, `_$HY` injection, fallback flicker) — Solid-specific OOO behaviour
- **Scenario 16**: typed `LoaderNotFound` for unknown product id → `404 + text/plain`. Streaming pipeline short-circuits before the first chunk.
- **Scenario 17 (Solid-unique)**: `node:http` TCP frame timing — empirically measures **multiple TCP frames spanning the slowest server-side delay (>400 ms)**. This is the empirical proof that Solid streaming is **actually streaming** at the HTTP level. Compare with the equivalent test in `svelte/ssr-streaming` and `angular/ssr-streaming` — both measure 1 frame, ~0 ms span (their "streaming" is client-side incremental hydration, not progressive HTTP flush).
- **Scenario 18 (Solid-unique)**: per-chunk content inspection — fallback marker appears in an early chunk, resolved review markup arrives in a later chunk. Proves the SERVER genuinely emits resolved sections separately from the shell, not just splits one buffered string across multiple TCP frames.
- **Scenario 19**: `<ErrorBoundary>` `reset` callback — clicking "Try again" re-attempts the failed branch without remounting the whole tree (Solid-distinct from React's ErrorBoundary which requires a key change to retry).
- **Scenario 20**: `onMount` + `isServer` SSR-safety — wire response contains zero references to `window.__MOUNT_LOG__`; the side-effect statement runs only after client hydration. Documents Solid's "actions are safe by construction" guarantee.
- **Scenario 22**: HEAD request — early-exits the streaming pipeline (`200` + `Content-Type`, empty body, fast). Cheap probe path that bypasses the full render so health checks / link previewers don't pay the OOO Suspense latency.
- **Scenario 23**: `use:trackView` directive — `IntersectionObserver` fires on hydration and populates `window.__VIEW_LOG__` with the product id.
- **Scenario 24**: `use:trackView` SSR-safety — server HTML never references `window` or `__VIEW_LOG__`; Solid SSR runtime skips `use:` action invocations entirely.

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
