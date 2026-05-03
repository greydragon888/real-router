# SSR Streaming Svelte Example

> Real-Router with Svelte 5 async SSR — `{#await}` blocks for deferred data — and **zero router-specific streaming API**.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before the server emits HTML
- **Svelte 5 `{#await}` blocks** for deferred sections (reviews, related items) — the `:then` branch is rendered on the client after hydration; the server ships only the pending fallback
- **`@real-router/svelte` adapter** identical to the classical `ssr/` example — no `<svelte:boundary>` is required for the basic deferred-data pattern, the await block carries its own pending/then/catch states
- **Per-route artificial delays** (600 ms reviews, 1200 ms related items) on **server only** — but the server doesn't actually block on them (see "How this differs"); client returns `Promise.resolve()` so resolved sections appear shortly after hydration

The router does **nothing streaming-specific**. All deferred-data behaviour comes from Svelte 5's native `{#await}` block. Real-Router's role is identical to non-streaming SSR: per-request `cloneRouter()`, `start(url)`, plugin-driven critical data via `state.context.data`.

## How This Differs From React 19, Vue 3, and Solid

Svelte 5 stable does **not** implement chunked streaming with out-of-order placeholders the way React 19 / Solid do. The `render()` call returns a single buffered HTML response; every `{#await}` block ships its **pending** branch in the response body (reading `await` inside a `<script>` block has the same behaviour). The deferred resolution then happens entirely on the client after hydration.

| | React 19 | Vue 3 | Solid | **Svelte 5** |
| --- | --- | --- | --- | --- |
| Streaming primitive | `renderToReadableStream` (true OOO + chunked HTTP) | `renderToWebStream` + chunked HTTP | `renderToStream` (true OOO + chunked HTTP) | `svelte/server.render` — single buffered response |
| Deferred-data API | `useMemo(() => fetch())` + `use(promise)` | `async setup()` with top-level `await` | `createResource(() => key, fetch)` accessor | `{#await fetchX()}` block (pending → client) |
| `<Suspense>` semantics in SSR | Non-blocking, fallback first, real content streamed in later | Blocking — server waits for setup() | Non-blocking, OOO `<template id="…">` chunks | Pending snippet only — async resolution is **client-side** |
| Selective hydration | Yes, per-island | No | Yes, via `_$HY` runtime | No — `hydrate()` claims the full tree atomically |
| Network model | Streaming | Streaming (chunked) | Streaming (chunked + selective) | Single response ("RSC-like": server shell + client data) |

Practical consequence: the streamed HTML body **does not** contain `data-review-id="r1"` — Svelte ships the `reviews-fallback` placeholder, the `<a fetch>` finishes during client hydration, and the browser DOM updates to the resolved `reviews-section`. The HTTP-level proof in this example's e2e suite therefore checks for the **fallback** in the response, then asserts that the **resolved sections** become visible after `page.goto(...)`.

The plan-level decision behind this example is documented in [§5.3](../../../../../.claude/plan-ssr-dogfooding-solid-svelte-angular-ru.md): Outcome A (async SSR + native `{#await}` works) is the likely default for Svelte; Outcome B (skip streaming with documented gap) is the fallback if the integration breaks. This implementation is Outcome A.

## Architecture

```
Server (per request):
  cloneRouter(base)
    → usePlugin(ssrDataPluginFactory(loaders))
    → start(url)                                   # critical product data resolved
    → await render(App, { props: { router } })     # pending snippets in {#await} blocks
                                                    # serialized, async-resolution NOT awaited
    → { head, body }                                # single buffered response
    → cleanup() (router.dispose() in finally)

Client (initial hydration):
  createAppRouter()
    → usePlugin(ssrDataPluginFactory(loaders))     # re-runs critical loader on hydration
    → hydrateRouter(router, window.__SSR_STATE__)  # rebuilds state via start(state.path)
    → hydrate(App, { target: #root, props: { router } })
                                                    # claims pending DOM, starts {#await} resolution
                                                    # fetchReviews resolves Promise.resolve() on client
                                                    # → reviews-section + related-section appear
```

## Svelte-Specific Gotchas

- **Server does NOT block on `{#await}` resolution.** Even with `await render(...)`, deferred awaits inside template `{#await}` blocks are rendered as their pending branch and shipped immediately. The server-only delays (`setTimeout`) in `fetchReviews`/`fetchRelated` therefore do **not** hold the response — they only matter if you genuinely run them on the client (which we don't here, since the client returns `Promise.resolve()`).
- **No chunked transfer.** The HTTP response is a single buffered HTML body. `Transfer-Encoding: chunked` is **not** set. The Vue example's e2e scenario that asserts chunked + per-Suspense timing is dropped here.
- **No OOO marker proof.** Svelte does not emit `<template id="…">` patches mid-stream. The Solid e2e scenario for `<template id="…">` chunks is dropped here.
- **`hydrate()`, not `mount({ hydrate: true })`.** Svelte 5 ships them as separate top-level exports. `mount({ hydrate: true })` is the deprecated Svelte 4 API surface via `asClassComponent` compat.
- **Composables return `{ current: T }` getters.** Read inside reactive contexts (template, `$derived`).

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
pnpm build:app    # svelte-check + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## E2e Coverage

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — Playwright suite mirroring the Vue baseline where the runtime allows, plus Svelte-specific markers:

- Cross-cutting (404, per-request isolation, hydration round-trip, critical data in `__SSR_STATE__`, no hydration warnings) — same as Vue/Solid
- Svelte-specific: HTTP response carries the **pending fallback** (`reviews-fallback`, `related-fallback`); resolved sections appear in the browser after hydration
- **Removed from Vue/Solid baseline:**
  - "Critical content precedes deferred sections" positional invariant — Svelte's pending model has no concept of "deferred sections in the response body"
  - "Chunked transfer + per-Suspense timing" — Svelte returns single-response HTML, no `Transfer-Encoding: chunked`
  - "`<template id="…">` OOO chunks" — Svelte does not emit them
  - "No fallback flicker" — Svelte's pending model **always** ships fallback first; the resolved content replaces it after hydration

## Library Philosophy

This example demonstrates Real-Router's library-first stance: **delegate to Svelte 5 native primitives instead of inventing router-specific streaming APIs**. The `{#await}` block + `<svelte:boundary>` (when needed for error containment) form the complete deferred-data SSR contract that Svelte ships — the router just provides per-request isolation and per-route critical data. **Standalone Svelte SSR with deferred-data semantics through native primitives, without SvelteKit framework lock-in.**

## See Also

- [`@real-router/ssr-data-plugin`](../../../../../packages/ssr-data-plugin)
- [`examples/web/react/ssr-examples/ssr-streaming/`](../../../react/ssr-examples/ssr-streaming) — React 19 counterpart (true OOO + chunked HTTP)
- [`examples/web/vue/ssr-examples/ssr-streaming/`](../../../vue/ssr-examples/ssr-streaming) — Vue 3 counterpart (blocking Suspense + chunked HTTP)
- [`examples/web/solid/ssr-examples/ssr-streaming/`](../../../solid/ssr-examples/ssr-streaming) — Solid counterpart (true OOO + chunked HTTP)
- Svelte docs: [`{#await}`](https://svelte.dev/docs/svelte/await), [`<svelte:boundary>`](https://svelte.dev/docs/svelte/svelte-boundary), [`render`](https://svelte.dev/docs/svelte/svelte-server)
