# SSR Streaming Angular Example

Real-Router with Angular 21 SSR + `@defer` + `withIncrementalHydration()` — and **zero router-specific streaming API**.

> **Terminology disclaimer.** "Streaming" in this example means **client-side incremental hydration**, not HTTP progressive flush. Angular 21's `AngularNodeAppEngine` does send the response with `Transfer-Encoding: chunked` (HTTP/1.1 default when the server doesn't know `Content-Length` upfront), but the body is rendered fully before any byte goes out: empirically the entire HTML lands in **one TCP frame, ~0 ms span** — there is no progressive flush, no `<!--$?-->`-style suspense markers, no out-of-order shell. The actual streaming win is that each `@defer` block ships as its own JS chunk and is downloaded + hydrated only when its trigger fires on the client. This is structurally different from React 19 / Solid streaming SSR (where the server progressively flushes HTML chunks as async data resolves). See "How This Differs From React / Vue / Svelte Streaming" below for the full comparison; reproduce the wire-format behavior with the Node `http.request` snippet at the bottom of this file.

## What This Demonstrates

- **`provideRealRouterFactory({ baseRouter, plugins })`** — same factory as `ssr/`, with `REQUEST` flowing per-request through `AngularNodeAppEngine`'s scope.
- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before the shell renders, mirrors React/Vue/Solid streaming examples.
- **`@defer (on viewport)` for Reviews** — server emits `@placeholder` content; client downloads + hydrates the Reviews component when its placeholder enters the viewport.
- **`@defer (on hover)` for RelatedItems** — server emits `@placeholder`; client downloads + hydrates only when the user hovers the placeholder area.
- **`@defer (on idle; prefetch on viewport; hydrate on idle)` for SpecSheet** — *decoupled triggers*. Chunk download starts as soon as the placeholder enters the viewport (prefetch), but the JS doesn't run on the main thread until `requestIdleCallback` fires (hydrate). Optimal for low-priority interactive content where TTI matters.
- **`@defer (on interaction)` for Q&A** — chunk loads + hydrates only after the user clicks/focuses/keys-down on the placeholder button. Cheaper than `(on hover)` for content the user is unlikely to read on every visit.
- **`@defer (when signal())` for Tech details** — predicate-based trigger. Unique to Angular: chunk loads + component hydrates when the bound signal flips truthy. **One-shot** — once activated, the component stays mounted even if the predicate flips back to false (use a regular `@if` for reactive show/hide).
- **`@defer (on timer(1500ms))` for News banner** — pure-time-based trigger. Block hydrates 1.5 s after the placeholder enters the DOM, no user interaction needed.
- **`@defer (on immediate)` for Analytics pixel** — code-split chunk that loads as soon as the app bootstraps. Equivalent to a regular eagerly-loaded component, but the chunk boundary keeps the main bundle small (useful for cache-bustable third-party SDKs).
- **`provideClientHydration(withIncrementalHydration(), withEventReplay())`** — Angular 21 stable. Per-`@defer` block hydration **plus** event replay: clicks/keydowns issued before a block hydrates are captured globally and replayed once the component takes over. Verified by an e2e test that clicks "Mark all read" while the Reviews chunk is artificially delayed by 1.2 s — the click survives the gap and `data-marked` flips to `"true"` after hydration.
- **`provideZonelessChangeDetection()`** — full Angular 21 zoneless mode; signals + `computed` drive change detection without `zone.js`. Compatible with `withIncrementalHydration()` + `ssr-data-plugin` end-to-end (no zone-related warnings on hydration).
- **`provideServerRendering(withRoutes(serverRoutes), withAppShell(AppComponent))`** — server-side bootstrap. `withAppShell` registers `AppComponent` as the root for the SSR pipeline; without it `AngularNodeAppEngine` cannot serialize the component tree. `withRoutes` wires `RenderMode.Server` to all paths so every URL goes through per-request `cloneRouter()`.
- **`@angular/router` + `NgRouterStub`** — required peer for `@angular/ssr`'s URL matching pipeline (`@angular/ssr` rejects bootstraps without `provideRouter(...)`). `NgRouterStub` is a no-op standalone Component routed under `path: "**"` so all routing decisions fall through to Real-Router's `<route-view>`. Pure SSR-pipeline placeholder, never visible.
- **`AngularNodeAppEngine` Web `Response`** — `Response.body` is a `ReadableStream` (Web Streams API) and `writeResponseToNodeResponse` pipes it to the Node `res` with `Transfer-Encoding: chunked` framing. **Don't confuse this with React 19 / Solid progressive streaming**: Angular fully renders the HTML before flushing the first byte (empirically: 1 TCP frame, ~0 ms span — the disclaimer above explains how to reproduce). Chunked transfer here is just HTTP/1.1 default framing for an unknown-length body, not out-of-order streaming.

The router does **nothing streaming-specific**. All streaming behavior comes from Angular's native `@defer` blocks + `withIncrementalHydration()` + `AngularNodeAppEngine`. Real-Router's role is identical to non-streaming SSR: per-request `cloneRouter()`, `start(url)`, plugin-driven critical data via `state.context.data`.

## How This Differs From React / Vue / Svelte Streaming

Angular 21 streaming SSR is **structurally different** from React 19's `renderToReadableStream`, Vue 3's `<Suspense>`, and Svelte 5's `{#await}`:

|  | React 19 | Vue 3 | Svelte 5 | **Angular 21** |
| --- | --- | --- | --- | --- |
| Streaming primitive | `renderToReadableStream` + `<Suspense>` | `renderToWebStream` + `<Suspense>` | `await render()` + `{#await}` | `AngularNodeAppEngine.handle()` returning a Web `Response` |
| Out-of-order placeholders in shell | Yes — `<!--$?-->` markers + chunks | No — sequential, top-down | No — pending snippet only | No — `@placeholder` is rendered into the same single HTML document; `@defer` is a *client-side* trigger boundary |
| Selective hydration | Yes — hydrates resolved islands | No — atomic `app.mount()` | No — atomic `mount` / `hydrate` | **Yes — `withIncrementalHydration()` hydrates per-`@defer` block on its trigger** |
| Server resolves async | progressive | blocking | pending only | full critical render server-side; deferred sections lazy on client |
| HTTP wire format | `Transfer-Encoding: chunked` + progressive flush (multiple frames over time) | chunked + progressive flush | single payload | **chunked framing, single TCP frame** (no progressive flush — body rendered in full before flush) |
| Network model | true HTTP streaming | true HTTP streaming | deferred-data SSR (no chunked HTTP) | **lazy hydration only** (HTTP body arrives at once) |

What this example actually demonstrates for Angular:

- **Critical content shipped immediately** — product name, price, description rendered server-side via the ssr-data-plugin loader
- **`@placeholder` blocks shipped server-side** — fallback UI ("Loading reviews…") visible before client JS arrives
- **Per-`@defer` lazy hydration** — Reviews hydrates on viewport, RelatedItems on hover; each downloads its own JS chunk on demand
- **Per-request router isolation** under concurrent load — same guarantee as the React/Vue examples

## Architecture

```
src/
  database.ts                     In-memory product store
  app.config.ts                   Shared providers — provideRealRouterFactory + provideRouter stub
  app.config.server.ts            Server-only — provideServerRendering(withRoutes(...) + withAppShell(AppComponent))
  app.routes.server.ts            ServerRoute[] with RenderMode.Server (per-request SSR)
  app.component.ts                Root standalone — <route-view> with home/products/notfound
  main.ts                         Client entry — bootstrapApplication + provideClientHydration(withIncrementalHydration(), withEventReplay())
  main.server.ts                  Server bootstrap — accepts BootstrapContext
  server.ts                       Express + AngularNodeAppEngine + writeResponseToNodeResponse
  router/
    createBaseRouter.ts           createRouter(routes, options)
    routes.ts                     home + products.{list,detail}
    loaders.ts                    products.list + products.detail loaders
  pages/
    home, not-found (.component.ts)
  components/
    products-list.component.ts    Critical loader data renders server-side
    product-detail.component.ts   Critical product info + 7 @defer blocks (one per trigger)
    reviews.component.ts          Loaded + hydrated via @defer (on viewport)
    related-items.component.ts    Loaded + hydrated via @defer (on hover)
    spec-sheet.component.ts       Loaded via @defer (on idle; prefetch on viewport; hydrate on idle)
    qa.component.ts               Loaded via @defer (on interaction)
    tech-details.component.ts     Loaded via @defer (when signal()) — predicate-driven, one-shot
    news-banner.component.ts      Loaded via @defer (on timer(1500ms))
    analytics-pixel.component.ts  Loaded via @defer (on immediate) — code-split chunk boundary

server-runner.mjs                 Node.js wrapper. The compiled server.mjs's isMainModule check
                                  is fragile across @angular/ssr versions; the wrapper imports
                                  `app.handle` and binds it to Node's request/response stream.
                                  See ssr/server-runner.mjs for the full rationale.
```

## Streaming Pattern

```html
<!-- product-detail.component.ts template -->
@if (data()?.product; as p) {
  <article data-testid="product-detail" [attr.data-product-id]="p.id">
    <!-- Critical content: shipped immediately, server-rendered -->
    <h1 data-testid="product-name">{{ p.name }}</h1>
    <p data-testid="product-price">${{ p.price }}</p>

    <!--
      Reviews: server emits @placeholder, client hydrates on viewport.
      @loading kicks in if the chunk hasn't returned within 200ms after
      the trigger fires; @error shows when the chunk import rejects.
      Both are real Angular 21 @defer secondary blocks — backed by
      e2e scenarios 14 (@error) and 15 (@loading) which artificially
      slow / abort the chunk to make these branches observable.
    -->
    @defer (on viewport; hydrate on viewport) {
      <reviews-section [productId]="p.id" />
    } @placeholder {
      <p data-testid="reviews-fallback">Loading reviews…</p>
    } @loading (after 200ms; minimum 1s) {
      <p data-testid="reviews-loading">Hydrating reviews…</p>
    } @error {
      <p data-testid="reviews-error">Reviews unavailable.</p>
    }

    <!--
      SpecSheet: prefetch chunk as soon as placeholder enters viewport,
      but defer hydration to requestIdleCallback. Chunk download is
      eager, JS execution is lazy.
    -->
    @defer (on idle; prefetch on viewport; hydrate on idle) {
      <spec-sheet [productId]="p.id" />
    } @placeholder {
      <p data-testid="spec-fallback">Loading specs…</p>
    }

    <!-- Q&A: chunk loads only after the user clicks the placeholder button -->
    @defer (on interaction; hydrate on interaction) {
      <qa-section [productId]="p.id" />
    } @placeholder {
      <button type="button" data-testid="qa-trigger">Show customer Q&A</button>
    }

    <!--
      Tech details: predicate-based @defer. Chunk loads + component
      hydrates when showTech() flips truthy. One-shot — once activated,
      stays mounted. (Use a regular @if for reactive show/hide.)
    -->
    <button type="button" data-testid="tech-toggle" (click)="toggleTech()">
      {{ showTech() ? "Hide" : "Show" }} technical details
    </button>
    @defer (when showTech(); hydrate when showTech()) {
      <tech-details [productId]="p.id" />
    } @placeholder {
      <p data-testid="tech-fallback">Click "Show" to load the spec table.</p>
    }

    <!-- News banner: appears 1500 ms after the placeholder enters the DOM -->
    @defer (on timer(1500ms); hydrate on timer(1500ms)) {
      <news-banner />
    } @placeholder {
      <p data-testid="news-fallback">Banner loading…</p>
    }

    <!-- Analytics pixel: own chunk for cache busting, hydrates immediately -->
    @defer (on immediate; hydrate on immediate) {
      <analytics-pixel [productId]="p.id" />
    }

    <!-- RelatedItems: server emits @placeholder, client hydrates on hover -->
    @defer (on hover; hydrate on hover) {
      <related-items [productId]="p.id" />
    } @placeholder {
      <p data-testid="related-fallback">Loading related items…</p>
    }
  </article>
}
```

Key constraints:

- **`@defer (on viewport)`** triggers when the placeholder enters viewport — for content above the fold this fires immediately on hydration; the placeholder may flash briefly. End-state assertion in tests is the resolved component, not the fallback.
- **`@defer (on hover)`** triggers only on actual user hover — the placeholder remains in the DOM until interaction, useful for low-priority content.
- **`hydrate on <trigger>`** is required (Angular 21 syntax) for `withIncrementalHydration()` to take ownership of the `@defer` block during hydration, not just lazy-load.
- **`@placeholder` content is rendered server-side** — same pattern as Vue's `<Suspense fallback>` and Svelte's pending snippet, but Angular wraps it in lazy-loadable `<ng-container>` boundaries.

## Run

```bash
pnpm dev          # ng serve — Angular dev server with HMR (no SSR)
pnpm build:app    # ng build — outputs dist/ssr-streaming-angular-example/{browser,server}/
pnpm preview      # node server-runner.mjs — runs Express + AngularNodeAppEngine on :4173
pnpm test:e2e     # Playwright — 22 acceptance scenarios
```

## E2e Scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 22 Playwright scenarios mirroring the Vue baseline where the runtime allows, plus Angular-specific scenarios:

1. **Critical content visible immediately on commit** — wall-clock < 1500 ms
2. **`@defer` placeholders are server-rendered** — raw HTTP response check via `request.get()`
3. **`@defer (on viewport)` hydrates Reviews automatically** — placeholder in viewport at load time
4. **`@defer (on hover)` keeps RelatedItems as fallback until user hovers** — proves the trigger semantics
5. **No hydration errors after defer triggers fire** — console clean of `hydrat` / `mismatch` warnings
6. **Every page is server-rendered (full-reload navigation)** — typed URL / refresh / deep-link
7. **Critical loader data lands in the SSR HTML response** — round-trip via `state.context.data`
8. **Per-request isolation** under 9 concurrent loads — `cloneRouter()` integrity
9. **Unknown route renders NotFound page** — `allowNotFound: true` returns 200 (see `ssr/` README for rationale)
10. **Home → products navigation works after hydration** — CSR via realLink + browser-plugin
11. **Response includes incremental hydration markers** — `ngh=` / `ng-server-context=` proof
12. **Response headers** — `text/html; charset=utf-8`, no `x-powered-by` leak, status 200. **Note:** the suite intentionally does **not** assert `Transfer-Encoding: chunked` (see test comment in `e2e/ssr-streaming.spec.ts`) — chunked framing is observed empirically via the Node `http.request` snippet at the bottom of this file, not via Playwright. Different Node HTTP runtimes / proxy chains can switch between chunked and `Content-Length` for the same body, so asserting on it would make the suite environment-dependent.
13. **Incremental hydration timing** — `Reviews` chunk loads at viewport, `RelatedItems` chunk loads only after hover. Network spy makes the contract explicit so the existing "appears after trigger" tests can't pass via eager preload.
14. **`@error` block** — Playwright route-fetches each `/chunk-*.js` and aborts only the one whose body contains `reviews-section`; the bootstrap chunk and RelatedItems chunk pass through, so the page hydrates normally and only the Reviews `@defer` block falls back to its `@error` template.
15. **`@loading` state** — same chunk-content matcher as scenario 14, but delays the Reviews chunk by 600 ms instead of failing it; the transient `reviews-loading` template becomes observable.
16. **`@defer (on idle; prefetch on viewport)` for SpecSheet** — verifies the spec-sheet chunk loads (proves prefetch + hydrate trigger pair is wired) and the resolved component is visible with correct per-product data.
17. **`@defer` placeholder taxonomy** — SSR HTML response contains `data-testid="spec-fallback"` (the placeholder) but does not contain `data-testid="spec-sheet"` (the resolved component). Confirms the placeholder text actually ships server-side rather than being client-only.
18. **`withEventReplay()` survives slow hydration** — slow the Reviews chunk by 1.2 s, click "Mark all read" while the chunk is en route, wait for hydration. After hydration the button's `data-marked` attribute equals `"true"`. Without `withEventReplay()` the click would be lost and the assertion would fail.
19. **`@defer (on interaction)`** — Q&A placeholder is a button; chunk loads + hydrates only after click. Network spy confirms zero `qa-section`-bearing chunks before the click, ≥1 after.
20. **`@defer (when signal())`** — `tech-details` chunk does not load until the toggle button flips the signal. Verified end-to-end: placeholder visible, toggle, component visible, toggle back → component **stays** (one-shot semantics, documented).
21. **`@defer (on timer(1500ms))`** — banner absent at 800 ms after page load, present by 3 s. Pure time-based trigger, no user input needed.
22. **`@defer (on immediate)`** — analytics pixel visible right after bootstrap with `data-product="1"` attribute, proving both chunk-loading and input binding work.

Note: there is no Angular equivalent of React's `<!--$?-->` Suspense placeholder marker test — Angular `@defer` uses a different boundary mechanism (component lazy chunks). Scenarios 2 and 11 are the Angular-specific surrogates. The "streaming" claim is on the **client** — Angular's incremental hydration loads each `@defer` chunk on demand. The HTTP body itself is delivered with `Transfer-Encoding: chunked` framing but in a single TCP frame after the server fully renders (no progressive flush); see scenario 13 for the actual streaming proof, and the snippet below to reproduce the wire-format behavior.

### Reproduce the wire-format behavior

```bash
# Headers — note Transfer-Encoding: chunked, no Content-Length
curl -sI http://localhost:4173/products/1

# Single-frame delivery — outputs `chunks: 1` and a 0 ms span
node --input-type=module -e '
import { request } from "node:http";
const t0 = Date.now();
const chunks = [];
await new Promise((resolve, reject) => {
  const req = request("http://localhost:4173/products/1", (res) => {
    res.on("data", (buf) => chunks.push({ ts: Date.now() - t0, size: buf.length }));
    res.on("end", () => resolve());
    res.on("error", reject);
  });
  req.on("error", reject); req.end();
});
console.log("chunks:", chunks.length, "span(ms):", (chunks.at(-1)?.ts ?? 0) - (chunks[0]?.ts ?? 0));
console.log(chunks);
'
```

## `@defer` Trigger Taxonomy

Seven of Angular 21's `@defer` triggers are demonstrated in this example, each on a separate component so chunk-content fingerprinting cleanly distinguishes them in the e2e suite:

| Trigger                                        | Component       | Use case                                                                 |
| ---------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `(on viewport; hydrate on viewport)`           | `reviews`       | Below-the-fold content the user is likely to scroll to.                  |
| `(on idle; prefetch on viewport; hydrate on idle)` | `spec-sheet` | Low-priority content. Decoupled triggers: prefetch eagerly, hydrate lazily. |
| `(on interaction; hydrate on interaction)`     | `qa`            | Content the user is unlikely to read on every visit.                     |
| `(when signal(); hydrate when signal())`       | `tech-details`  | Predicate-driven hydration (toggle, feature flag). **One-shot** — once activated, stays mounted. |
| `(on timer(1500ms); hydrate on timer(1500ms))` | `news-banner`   | Time-delayed content that should appear after the page settles.          |
| `(on immediate; hydrate on immediate)`         | `analytics-pixel` | Code-split chunk for a chunk boundary, no lazy trigger.                |
| `(on hover; hydrate on hover)`                 | `related-items` | Content the user might browse but doesn't always need.                   |

Notably **absent**: `(on never)` — Angular's roadmap mentions a "render server-side, never hydrate" trigger for static SEO content, but the 21.2 compiler rejects it (`NG5002: Unrecognized trigger type "never"`). Real-Router's library philosophy is to use only stable Angular features — when `(on never)` ships, we'll add a 23rd scenario.

## Why No `<Suspense>` / `defer()` Wrapper API?

Real-Router intentionally does **not** ship a `<Suspense>` component or `defer()` helper. Angular 21's `@defer` blocks already provide the same ergonomics with native compiler support. The router supplies the data; the framework handles the rendering pipeline.

## Library Philosophy

This example demonstrates Real-Router's library-first stance: **delegate to Angular 21 native primitives instead of inventing router-specific streaming APIs**. `@defer (on viewport)`, `@defer (on hover)`, `withIncrementalHydration()`, and `AngularNodeAppEngine` form the complete streaming SSR contract that Angular ships — the router just provides per-request isolation and per-route critical data.

## Post-hydration loader skip via TransferState bridge (#599)

Same flow as the runtime SSR sibling: `provideRealRouterFactory` writes the SSR-resolved router state to Angular's `TransferState` after `await router.start(path)` resolves on the server, and the client's bootstrap reads the seed and calls `hydrateRouter(router, ssrJson)` instead of `router.start(path)` — `ssr-data-plugin`'s start interceptor reuses the server-resolved `state.context.data` without re-invoking the critical loader on first paint. Streaming-specific note: `withIncrementalHydration()` + `@defer` blocks register their own hydration triggers (viewport / hover / timer / immediate) **after** bootstrap completes, so the TransferState write timing is unaffected by deferred-block hydration. The deferred `@defer` blocks own their own data fetching (independent of `ssr-data-plugin`). See [`ssr/README.md`](../ssr/README.md) → "Post-hydration loader skip via TransferState bridge (#599)" for the full server↔client lifecycle. Verified end-to-end in `e2e/ssr-streaming.spec.ts` via `window.__LOADER_CALLS__` counter assertion.

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin) — per-route critical data loading
- [`examples/web/react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 counterpart with out-of-order Suspense placeholders
- [`examples/web/vue/ssr-examples/ssr-streaming/`](../../../vue/ssr-examples/ssr-streaming) — Vue 3 counterpart with blocking Suspense
- [`examples/web/svelte/ssr-examples/ssr-streaming/`](../../../svelte/ssr-examples/ssr-streaming) — Svelte 5 counterpart with `{#await}` blocks
- Angular docs: [Deferrable views (`@defer`)](https://angular.dev/guide/templates/defer), [Incremental hydration](https://angular.dev/guide/hydration#incremental-hydration), [`@angular/ssr`](https://angular.dev/guide/ssr)
