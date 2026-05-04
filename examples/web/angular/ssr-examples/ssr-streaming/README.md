# SSR Streaming Angular Example

Real-Router with Angular 21 streaming SSR — `AngularNodeAppEngine` + `@defer` blocks + `withIncrementalHydration()` — and **zero router-specific streaming API**.

## What This Demonstrates

- **`provideRealRouterFactory({ baseRouter, plugins })`** — same factory as `ssr/`, with `REQUEST` flowing per-request through `AngularNodeAppEngine`'s scope.
- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before the shell renders, mirrors React/Vue/Solid streaming examples.
- **`@defer (on viewport)` for Reviews** — server emits `@placeholder` content; client downloads + hydrates the Reviews component when its placeholder enters the viewport.
- **`@defer (on hover)` for RelatedItems** — server emits `@placeholder`; client downloads + hydrates only when the user hovers the placeholder area.
- **`provideClientHydration(withIncrementalHydration())`** — Angular 21 stable feature; hydrates per-`@defer` block, not the whole tree atomically.
- **AngularNodeAppEngine streaming** — `Response.body` is a `ReadableStream`; `writeResponseToNodeResponse` pipes chunks to the Node `res`.

The router does **nothing streaming-specific**. All streaming behavior comes from Angular's native `@defer` blocks + `withIncrementalHydration()` + `AngularNodeAppEngine`. Real-Router's role is identical to non-streaming SSR: per-request `cloneRouter()`, `start(url)`, plugin-driven critical data via `state.context.data`.

## How This Differs From React / Vue / Svelte Streaming

Angular 21 streaming SSR is **structurally different** from React 19's `renderToReadableStream`, Vue 3's `<Suspense>`, and Svelte 5's `{#await}`:

|  | React 19 | Vue 3 | Svelte 5 | **Angular 21** |
| --- | --- | --- | --- | --- |
| Streaming primitive | `renderToReadableStream` + `<Suspense>` | `renderToWebStream` + `<Suspense>` | `await render()` + `{#await}` | `AngularNodeAppEngine.handle()` + `Response.body` ReadableStream |
| Out-of-order placeholders in shell | Yes — `<!--$?-->` markers + chunks | No — sequential, top-down | No — pending snippet only | Yes — `@placeholder` content shipped server-side, real component downloaded + hydrated on trigger |
| Selective hydration | Yes — hydrates resolved islands | No — atomic `app.mount()` | No — atomic `mount` / `hydrate` | **Yes — `withIncrementalHydration()` hydrates per-`@defer` block on its trigger** |
| Server resolves async | progressive | blocking | pending only | full critical render server-side; deferred sections lazy on client |
| Network model | streaming | streaming | RSC-like | streaming + lazy hydration |

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
  main.ts                         Client entry — bootstrapApplication + provideClientHydration(withIncrementalHydration())
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
    product-detail.component.ts   Critical product info + @defer blocks for Reviews & RelatedItems
    reviews.component.ts          Loaded + hydrated via @defer (on viewport)
    related-items.component.ts    Loaded + hydrated via @defer (on hover)

server-runner.mjs                 Node.js wrapper — see ssr/server-runner.mjs for rationale
```

## Streaming Pattern

```html
<!-- product-detail.component.ts template -->
@if (data()?.product; as p) {
  <article data-testid="product-detail" [attr.data-product-id]="p.id">
    <!-- Critical content: shipped immediately, server-rendered -->
    <h1 data-testid="product-name">{{ p.name }}</h1>
    <p data-testid="product-price">${{ p.price }}</p>

    <!-- Reviews: server emits @placeholder, client hydrates on viewport -->
    @defer (on viewport; hydrate on viewport) {
      <reviews-section [productId]="p.id" />
    } @placeholder {
      <p data-testid="reviews-fallback">Loading reviews…</p>
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
pnpm test:e2e     # Playwright — 11 acceptance scenarios
```

## E2e Scenarios

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 11 Playwright scenarios mirroring the Vue baseline where the runtime allows, plus Angular-specific scenarios:

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

Note: there is no Angular equivalent of React's `<!--$?-->` Suspense placeholder marker test — Angular `@defer` uses a different boundary mechanism (component lazy chunks). Scenarios 2 and 11 are the Angular-specific surrogates.

## Why No `<Suspense>` / `defer()` Wrapper API?

Real-Router intentionally does **not** ship a `<Suspense>` component or `defer()` helper. Angular 21's `@defer` blocks already provide the same ergonomics with native compiler support. The router supplies the data; the framework handles the rendering pipeline.

## Library Philosophy

This example demonstrates Real-Router's library-first stance: **delegate to Angular 21 native primitives instead of inventing router-specific streaming APIs**. `@defer (on viewport)`, `@defer (on hover)`, `withIncrementalHydration()`, and `AngularNodeAppEngine` form the complete streaming SSR contract that Angular ships — the router just provides per-request isolation and per-route critical data.

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin) — per-route critical data loading
- [`examples/web/react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 counterpart with out-of-order Suspense placeholders
- [`examples/web/vue/ssr-examples/ssr-streaming/`](../../../vue/ssr-examples/ssr-streaming) — Vue 3 counterpart with blocking Suspense
- [`examples/web/svelte/ssr-examples/ssr-streaming/`](../../../svelte/ssr-examples/ssr-streaming) — Svelte 5 counterpart with `{#await}` blocks
- Angular docs: [Deferrable views (`@defer`)](https://angular.dev/guide/templates/defer), [Incremental hydration](https://angular.dev/guide/hydration#incremental-hydration), [`@angular/ssr`](https://angular.dev/guide/ssr)
