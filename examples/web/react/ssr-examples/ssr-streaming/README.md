# SSR Streaming React Example

> Real-Router with React 19 streaming SSR — `renderToReadableStream` + `<Suspense>` + `use(promise)` — and **zero router-specific streaming API**.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before shell renders
- **React 19 native streaming** via `renderToReadableStream` — server emits HTML shell + script chunks
- **`<Suspense>` + `use(promise)`** for deferred sections (reviews, related items) that stream in after the shell
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — client hydration is instant via `Promise.resolve()`
- **Full-reload navigation** via `<Link>` falling back to native `<a href>` (no `browser-plugin`) — every navigation is a fresh SSR render with its own streaming demonstration

The router does **nothing streaming-specific**. All streaming behavior comes from React 19's native `<Suspense>` + `renderToReadableStream` + `use(promise)`. Real-Router's role is identical to non-streaming SSR: per-request `cloneRouter()`, `start(url)`, plugin-driven critical data via `state.context.data`.

## Architecture

```
Server (per request):
  cloneRouter(base)
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                  # critical data resolved (sync product)
    → renderToReadableStream(<RouterProvider><App /></RouterProvider>)
                                                  # shell ready immediately (TTFB ~5ms)
    → pipe stream chunks to res                   # fallbacks first, then deferred sections
    → cleanup()                                   # router.dispose() after stream completes

Client (initial hydration only):
  createAppRouter()
    → usePlugin(ssrDataPluginFactory(loaders))    # re-runs critical loader on hydration
    → hydrateRouter(router, window.__SSR_STATE__) # rebuilds state via start(state.path)
    → hydrateRoot(...)                            # claims streamed DOM, attaches handlers
                                                  # use(Promise.resolve(value)) returns sync — no flash
```

## Streaming Pattern

The deferred Suspense components own their own data fetching with **environment-aware delays**:

```tsx
const SERVER_REVIEWS_DELAY_MS = 600;

function fetchReviews(productId: string): Promise<Review[]> {
  if (typeof globalThis.window === "undefined") {
    return new Promise((resolve) => {
      setTimeout(() => resolve(REVIEWS_BY_PRODUCT[productId]), SERVER_REVIEWS_DELAY_MS);
    });
  }
  return Promise.resolve(REVIEWS_BY_PRODUCT[productId]);
}

export function Reviews({ productId }: ReviewsProps) {
  const reviewsPromise = useMemo(() => fetchReviews(productId), [productId]);
  const reviews = use(reviewsPromise);
  return <section>...</section>;
}
```

Key constraints:

- **Per-render memoized promise** (`useMemo` with `[productId]` dep) — fresh promise every server request, NOT cached at module level. This avoids `React.lazy`'s singleton cache that would make streaming visible only on the first request.
- **Server delay via `setTimeout`** simulates slow data sources without external services.
- **Client returns `Promise.resolve(value)`** — `use()` resolves synchronously, no hydration flash.

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright — 5 acceptance scenarios
```

## E2e Scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 5 Playwright scenarios:

1. **Shell renders before deferred content** — `page.goto(..., { waitUntil: "commit" })` + critical content visible in <750 ms
2. **Streaming response contains BOTH fallbacks AND resolved content** — HTTP-level test verifying the streamed HTML contains `reviews-fallback` markers (`<!--$?-->`) AND `reviews-section` content
3. **Deferred sections render after fallbacks** — browser visibility check (sections appear after Suspense streaming completes)
4. **No hydration errors** — console clean of `hydrat`/`mismatch` warnings after stream completes
5. **Every page is server-rendered with streaming** — full-reload navigation between pages, each visit triggers fresh SSR + streaming

```bash
pnpm test:e2e
# 5 passed (8.9s)
```

## Why No `<Await>` / `defer()` Wrapper API?

Real-Router intentionally does **not** ship a `<Await>` component or `defer()` helper. React 19's `<Suspense>` + `use(promise)` already provides the same ergonomics with one less abstraction layer.

```tsx
// React Router v7 / Remix
<Suspense fallback={<Spinner />}>
  <Await resolve={dataPromise}>
    {(data) => <DataView data={data} />}
  </Await>
</Suspense>

// Real-Router (just React 19 native)
<Suspense fallback={<Spinner />}>
  <DataView promise={dataPromise} />
</Suspense>

function DataView({ promise }: { promise: Promise<Data> }) {
  const data = use(promise);
  return <div>{data.title}</div>;
}
```

## `createPortal` modal — React-native portal pattern

`src/components/ProductSpecsModal.tsx` demonstrates React's `createPortal`: a button declared inside `<ProductDetail>` that mounts its dialog into `#modal-target` (a sibling of `#root` in `index.html`), not inside the article that hosts the trigger. Standard portal pattern — declared in one tree, rendered in another.

The implementation uses a `mounted` state gate (`useState(false)` + `useEffect(() => setMounted(true), [])`) to defer portal rendering until after hydration. Reasons:

1. SSR cannot render portals — the target DOM node doesn't exist (we render to a string). React 19 skips portal output during `renderToReadableStream`, but the hydration walker would mismatch if the dialog were conditionally rendered based on a state that flips post-hydration.
2. With `mounted` gate, SSR ships only the trigger button. Hydration completes without warnings. User clicks → `setOpen(true)` → React calls `createPortal(...)` with the live DOM node and the dialog appears in `#modal-target`.

Verified by Scenarios 15 (closed modal contributes zero markup to streamed HTML, `#modal-target` host node exists from `index.html`) and 16 (after click, dialog lives inside `#modal-target` and **not** inside `#root`).

## Loader-driven HTTP: typed LoaderNotFound for unknown ids

`src/_loader-errors.ts` defines `LoaderNotFound`. The `products.detail` loader throws it for ids not in the in-memory store; `entry-server.tsx` catches the typed error BEFORE constructing the stream and returns a plain-text 404 result. This fixes a leak in the previous design — a generic `throw new Error()` bubbled past the streaming pipeline's catch path, `cleanup()` was never called, and the per-request router was held until GC. Now the catch path always disposes (`finally` block in server).

The error path bypasses the streaming pipeline entirely — `Transfer-Encoding: chunked` is absent, no `<Suspense>` fallback flicker, just a fast plain-text response. Verified by Scenario 11.

## Library Philosophy

This example demonstrates Real-Router's library-first stance: **delegate to React 19 native primitives instead of inventing router-specific streaming APIs**. The `<Suspense>` boundary, `use(promise)`, and `renderToReadableStream` already form a complete streaming SSR contract — the router just provides per-request isolation and per-route critical data.

Compare with:

| Solution | Streaming primitive | Router-specific API |
|---|---|---|
| React Router v7 | React 19 streams + `defer()` wrapper | `defer()`, `<Await>` |
| SvelteKit | unawaited promises in `load()` | Framework conventions |
| Real-Router | React 19 streams + `use(promise)` | **None** — pure delegation |

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin) — per-route critical data loading
- [`examples/web/react/ssr-examples/ssr/`](../ssr) — classical SSR (no streaming) precedent
- [`examples/web/react/ssr-examples/ssr-rsc/`](../ssr-rsc) — React Server Components + Flight streaming via `@real-router/rsc-server-plugin`
- [Wiki: Streaming SSR](https://github.com/greydragon888/real-router/wiki/Streaming-SSR) — full design rationale
- React 19 docs: [`renderToReadableStream`](https://react.dev/reference/react-dom/server/renderToReadableStream), [`use(promise)`](https://react.dev/reference/react/use), [`<Suspense>`](https://react.dev/reference/react/Suspense)
