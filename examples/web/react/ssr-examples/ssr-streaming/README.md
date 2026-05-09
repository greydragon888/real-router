# SSR Streaming React Example

> Real-Router with React 19 streaming SSR — `renderToReadableStream` + `<Suspense>` + `defer()` formal API — and the standard critical/deferred wire-format used by SvelteKit `streamed`, Remix/RR7 `defer()`, and TanStack Start `defer()`.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` `defer()` formal API** — `loaders.products.detail` returns `defer({ critical: { product }, deferred: { reviews, related } })`. Critical data unblocks the shell; deferred promises stream as their data lands.
- **Cross-adapter wire-format** — `injectDeferredScripts` (server-side) interleaves `<script>__rrDefer__("key", json)</script>` chunks with React's HTML stream as each deferred promise resolves. The same NDJSON-shaped contract underpins every adapter's `useDeferred()` consumer.
- **React 19 native streaming** via `renderToReadableStream` — server emits HTML shell + Suspense templates as deferred sections become available.
- **`<Streamed>` + `<Await>`** — adapter components wrapping React 19's native `<Suspense>` + `use(promise)`. Use them when you want the SvelteKit/Remix-style boundary naming; the underlying mechanism is the same.
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — the client navigates with already-resolved promises so the post-hydration UX feels instant.
- **Full-reload navigation** — `@real-router/browser-plugin` is intentionally not registered in `entry-client.tsx`, so `<Link>` clicks fall through to native `<a href>` and every navigation triggers a fresh SSR + streaming pipeline. Same trade-off as `react/ssr-examples/ssr-rsc/` (different reason: streaming demos are most valuable when each visit re-runs them).

## Architecture

```
Server (per request):
  cloneRouter(base)
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                    # critical { product } resolved;
                                                    # state.context.ssrDataDeferred = {
                                                    #   reviews: Promise, related: Promise
                                                    # }
    → renderToReadableStream(<RouterProvider>...<App /></RouterProvider>)
                                                    # shell ready BEFORE the slowest deferred section resolves
    → injectDeferredScripts(reactStream, deferredMap)
                                                    # interleaves <script>__rrDefer__("reviews", "...json...")</script>
                                                    # tags as each deferred promise lands
    → server.ts sets Transfer-Encoding: chunked, pipes stream chunks to res
    → cleanup()                                     # router.dispose() in finally — fires on success,
                                                    # typed loader errors, and client-disconnect

Client (initial hydration only):
  createAppRouter()
    → usePlugin(ssrDataPluginFactory(loaders))      # reuses pre-resolved data via #596 — loader skipped;
                                                    # plugin reconstructs state.context.ssrDataDeferred
                                                    # from the global __rrDeferRegistry__ that the inline
                                                    # __rrDefer__("key", json) scripts populate
    → hydrateRouter(router, window.__SSR_STATE__)   # excludes ssrDataDeferred (Promises don't serialize),
                                                    # ships ssrDataDeferredKeys: ["reviews", "related"]
    → hydrateRoot(...)                              # Suspense boundaries match the streamed shell;
                                                    # Await(name="reviews") reads
                                                    # state.context.ssrDataDeferred.reviews and
                                                    # use(promise) returns the value the registry settled
                                                    # via __rrDefer__("reviews", ...) inline script
```

**Post-hydration loader skip (#596).** `hydrateRouter()` deposits the parsed `__SSR_STATE__` into a one-shot scratchpad on `RouterInternals.hydrationState` before `router.start(state.path)`. `ssr-data-plugin`'s start interceptor reads the scratchpad and writes the server-resolved value to `state.context.data` directly, skipping the loader call. With `defer()`, the same path additionally reconstructs `state.context.ssrDataDeferred` from the global registry the inline scripts populate. Result: zero loader-driven calls on first paint after hydration. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts).

## `defer()` Loader

```ts
"products.detail": () => (params) => {
  const id = params.id as string;
  const product = getProduct(id);
  if (!product) throw new LoaderNotFound(`product:${id}`);

  return defer({
    critical: { product },
    deferred: {
      reviews: fetchReviews(id),
      related: fetchRelated(id),
    },
  });
}
```

The plugin extracts:

- `state.context.data = { product }` — critical, awaited before render
- `state.context.ssrDataDeferred = { reviews: Promise, related: Promise }` — promises React `<Suspense>` awaits
- `state.context.ssrDataDeferredKeys = ["reviews", "related"]` — shipped to the client (registry reconstruction)

## Consuming with `<Await>` and `<Streamed>`

```tsx
import { Streamed, Await } from "@real-router/react/ssr";

<ReviewsErrorBoundary>
  <Streamed fallback={<p data-testid="reviews-fallback">Loading reviews…</p>}>
    <Await<Review[]> name="reviews">
      {(reviews) => <ReviewList reviews={reviews} />}
    </Await>
  </Streamed>
</ReviewsErrorBoundary>
```

Equivalent to the lower-level form (one fewer abstraction):

```tsx
import { Suspense, use } from "react";
import { useDeferred } from "@real-router/react/ssr";

function Reviews(): ReactElement {
  const reviews = use(useDeferred<Review[]>("reviews"));
  return <ReviewList reviews={reviews} />;
}

<Suspense fallback={...}>
  <Reviews />
</Suspense>
```

Pick whichever style matches your codebase. The `<Streamed>`/`<Await>` pair gives you cross-framework naming alignment with the SvelteKit `{#await}` / Solid `<Await/>` conventions; the inline `use(useDeferred(...))` form is closer to React 19 native primitives.

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright — 18 acceptance scenarios
```

## E2e Scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 18 Playwright scenarios. Highlights:

**Streaming basics (1-5)**
1. Shell renders before deferred content — critical content visible in <750 ms
2. Streamed response contains BOTH fallbacks AND resolved content (`reviews-fallback` markers + `reviews-section`) and the `__rrDefer__` settle scripts
3. Deferred sections render after fallbacks (browser visibility check)
4. No hydration errors — console clean of `hydrat`/`mismatch`
5. Every page is server-rendered with streaming (full-reload navigation re-triggers streaming)

**State + isolation (6-9)**
6. `__SSR_STATE__` carries critical product data + `ssrDataDeferredKeys`, no live promises
7. Critical content rendered BEFORE `<Suspense>` boundaries in HTML byte order
8. Reviews rendered with correct review ids per product
9. Per-request isolation under 9 concurrent loads — proves `cloneRouter()` integrity

**Suspense error containment (10) and loader-driven HTTP (11)**
10. Product id "4" — server resolves empty reviews list, client `use(rejectedPromise)` throws → `ReviewsErrorBoundary` catches → sibling `<RelatedItems>` unaffected
11. `/products/9999` — typed `LoaderNotFound` short-circuits the streaming pipeline → 404 text/plain (no chunked transfer)

**Production HTTP semantics (12-14)**
12. Per-route `Cache-Control` from `cache-policies.ts`
13. **No `ETag`** (intentional) — streamed responses can't be hashed without buffering, which would defeat streaming.
14. `AbortController` per request fires on `req.on("close")` — stream pump exits, reader disposed, no router leak

**createPortal (15-16)** — see "createPortal modal" section below
**Selective hydration wire signature (17-18)** — see "Selective hydration" section below

## Selective hydration — empirical proof of React 19's flagship feature

React 19 is one of the few stable frameworks that ships **out-of-order Suspense placeholders** + **selective hydration**: faster Suspense islands hydrate independently as their data lands, slower ones continue showing fallbacks. In this monorepo only Solid's `renderToStream` produces an equivalent wire signature; Vue 3 stable, Preact 10 (without `lazy()`), and Svelte 5 do not. Two e2e tests verify the wire signature:

- **Scenario 17** — `<!--$?-->` Suspense placeholder markers appear in the streamed HTML alongside `<template id="B:0">` / `<template id="B:1">` resolved-content tags AND `<script>__rrDefer__("reviews", "...")</script>` settle calls. The fallback HTML AND the resolved sections both ship in the same response — proving React streamed the shell first, then resolved templates as their data became available.
- **Scenario 18** — byte-offset analysis: `data-testid="reviews-section"` appears in the response BEFORE `data-testid="related-section"`, matching their resolution order (600 ms vs 1200 ms server delay). Fallback markers (`reviews-fallback`, `related-fallback`) appear earlier still — proving the shell shipped first.

This is the empirical proof of out-of-order completion. Vue 3 stable's `renderToWebStream` ships everything together at the slowest offset; Solid's sync `renderToString` blocks entirely. Real out-of-order requires an async streaming renderer — React 19 ships sections as their data is ready, in completion order, and that's what selective hydration's wire signature looks like in HTTP bytes.

## `createPortal` modal — React-native portal pattern

`src/components/ProductSpecsModal.tsx` demonstrates React's `createPortal`: a button declared inside `<ProductDetail>` that mounts its dialog into `#modal-target` (a sibling of `#root` in `index.html`), not inside the article that hosts the trigger. Standard portal pattern — declared in one tree, rendered in another.

The implementation uses a `mounted` state gate (`useState(false)` + `useEffect(() => setMounted(true), [])`) to defer portal rendering until after hydration. Reasons:

1. SSR cannot render portals — the target DOM node doesn't exist (we render to a string). React 19 skips portal output during `renderToReadableStream`, but the hydration walker would mismatch if the dialog were conditionally rendered based on a state that flips post-hydration.
2. With `mounted` gate, SSR ships only the trigger button. Hydration completes without warnings. User clicks → `setOpen(true)` → React calls `createPortal(...)` with the live DOM node and the dialog appears in `#modal-target`.

Verified by Scenarios 15 (closed modal contributes zero markup to streamed HTML, `#modal-target` host node exists from `index.html`) and 16 (after click, dialog lives inside `#modal-target` and **not** inside `#root`).

## Suspense error containment — `ReviewsErrorBoundary` + product id "4"

`database.ts` declares `id: "4"` ("Broken Reviews Demo") as a fixture for testing Suspense error containment. The behaviour:

- **Server**: `fetchReviews("4")` resolves an empty list — no error during SSR. The shell + fallbacks + sibling sections render normally.
- **Client**: post-hydration `fetchReviews("4")` returns `Promise.reject(new Error("Reviews service unavailable"))`. `use(rejectedPromise)` throws synchronously inside the `<Reviews>` component.
- `<ReviewsErrorBoundary>` (a class component wrapping `<Streamed>` for Reviews) catches the throw and replaces the SSR-rendered Reviews section with the error UI.
- Critical product data + sibling deferred (`<RelatedItems>`) render unaffected.

This proves React 19's Suspense + Error Boundary pair contains errors at the boundary granularity — one rejected promise doesn't tear down the page. Verified by Scenario 10.

## Loader-driven HTTP: typed LoaderNotFound for unknown ids

Typed loader errors live in `@real-router/ssr-data-plugin/errors` (hoisted from per-example `_loader-errors.ts` files in commit `e7ad413e`). The `products.detail` loader imports `LoaderNotFound` and throws it for ids not in the in-memory store; `entry-server.tsx` catches the typed error BEFORE constructing the stream and returns a plain-text 404 result. This fixes a leak in the previous design — a generic `throw new Error()` bubbled past the streaming pipeline's catch path, `cleanup()` was never called, and the per-request router was held until GC. Now the catch path always disposes (`finally` block in server).

The error path bypasses the streaming pipeline entirely — `Transfer-Encoding: chunked` is absent, no `<Suspense>` fallback flicker, just a fast plain-text response. Verified by Scenario 11.

## Production HTTP semantics: Cache-Control + AbortController (no ETag)

Streaming pipelines have a different production-grade footprint than classical SSR — the body is unhashable mid-flight, so ETag is intentionally absent. `server/index.ts` adds two pieces:

- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, max-age=300, s-maxage=3600, must-revalidate`; `/products` → `public, max-age=60`; `/products/:id` → `public, max-age=120`. Headers are set BEFORE the stream starts (Express `res.setHeader` before the first `res.write`).
- **No `ETag`** (intentional) — buffering the streamed HTML to hash it would defeat streaming (TTFB jumps to "after the slowest deferred section resolves"). Production CDNs add their own buffered ETag layer at the edge while still benefiting from the origin's chunked transfer.
- **`AbortController` per request** — `req.on("close")` aborts the controller; the stream-pump loop exits within ~800 ms even if the client gives up mid-flight, the reader is disposed, and `cleanup()` runs in `finally` so the per-request router is never held past the connection. Without this wiring, a client who closed the tab during the 1.2 s related-items delay would still hold the worker until the loader settled.

Verified by Scenarios 12, 13, 14 (Cache-Control values, no ETag header, AbortController fast-release).

## Library Philosophy

Real-Router ships `defer()` + `<Await>` + `<Streamed>` because the **wire format must be a contract**, not a per-application convention. Once one client team and one server emit different shapes, the streaming protocol drifts.

The contract Real-Router commits to:

- `defer({ critical, deferred })` from a loader produces a stable `state.context.ssrDataDeferred` shape across all six adapters (React, Solid, Vue, Svelte, Preact, Angular).
- The wire chunks (`<script>__rrDefer__("key", json)</script>`) are NDJSON-shaped — a string the client `JSON.parse`s. Plug `devalue.parse` / `superjson.parse` for non-JSON types via `injectDeferredScripts({ serialize })`.
- `<Suspense>` + `use(promise)` is what `<Streamed>`/`<Await>` reduce to — pick whichever feels more idiomatic. Both produce identical DOM.

| Solution | Streaming primitive | Wire format |
|---|---|---|
| React Router v7 | React 19 streams + `defer()` wrapper | bespoke `<Await resolve={…}>` |
| SvelteKit | unawaited promises in `load()` | bespoke streamed shape |
| TanStack Start | React 19 streams + `defer()` wrapper | bespoke wire bundling |
| Real-Router | React 19 streams + `defer()` formal API | NDJSON `__rrDefer__("key", json)` — same shape across 6 adapters |

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin) — per-route critical/deferred data loading via `defer()`
- [`examples/web/react/ssr-examples/ssr/`](../ssr) — classical SSR (no streaming) precedent
- [`examples/web/react/ssr-examples/ssr-rsc/`](../ssr-rsc) — React Server Components + Flight streaming via `@real-router/rsc-server-plugin`
- [Wiki: Streaming SSR](https://github.com/greydragon888/real-router/wiki/Streaming-SSR) — full design rationale
- React 19 docs: [`renderToReadableStream`](https://react.dev/reference/react-dom/server/renderToReadableStream), [`use(promise)`](https://react.dev/reference/react/use), [`<Suspense>`](https://react.dev/reference/react/Suspense)
