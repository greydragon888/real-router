# SSR Deferred-Data Svelte Example

> Real-Router with Svelte 5 SSR + `{#await}` blocks for deferred data — and **zero router-specific streaming API**.

> **Terminology disclaimer.** This example demonstrates **deferred-data SSR**, not HTTP streaming. Earlier README revisions called it "RSC-like" — that term oversells the pattern: React 19 RSC ships serialized component trees + a Flight protocol over chunked HTTP. Svelte 5's `{#await}` ships HTML with placeholder branches in a single buffered response — async resolution then runs entirely **on the client** after hydration. Empirical proof: the body lands in **one TCP frame, ~0 ms span** (e2e Scenario 12 reproduces this with `node:http`). The symmetric test in `examples/web/solid/ssr-examples/ssr-streaming/` (Scenario 17) measures **multiple frames spanning >400 ms** — empirical proof of true OOO over chunked HTTP. Svelte's `<50 ms` assertion inverts the assertion direction. For real progressive HTTP streaming, see the React 19 / Solid / Vue counterparts.

## What This Demonstrates

- **`@real-router/ssr-data-plugin` for critical data** — `state.context.data.product` resolves before the server emits HTML
- **Svelte 5 `{#await}` blocks** for deferred sections (reviews, related items) — the `:then` branch is rendered on the client after hydration; the server ships only the pending fallback
- **Why no `defer()` from `@real-router/ssr-data-plugin` here?** Svelte 5 has **no progressive HTTP-flush** — `render()` produces one buffered body, late-resolving promises are never streamed. The native `{#await}` block already covers the same use case (RSC-like deferred-data SSR: pending HTML from the server, real content after client-side resolution). The cross-adapter `defer()` API is available at `@real-router/svelte/ssr` (`useDeferred`/`<Await>`/`<Streamed>` Svelte components) for cross-framework consistency, but **this example uses Svelte's native `{#await}` directly**. See `packages/ssr-data-plugin/CLAUDE.md` ("Adapters that intentionally don't dogfood `defer()`") for the full rationale
- **`<svelte:boundary>` for reactive errors** — `ProductActions.svelte` wraps a child component in `<svelte:boundary>`; clicking the trigger throws inside `$derived.by()` of the child, the boundary catches it and renders the `@failed` snippet (with `reset` to recover) and fires `onerror` for production observability (Sentry-style). The `{#await}` `{:catch}` branch covers async loader rejections (see `Reviews.svelte` for `productId === "4"` reject); `<svelte:boundary>` complements it for reactive/render-time errors.
- **`<svelte:boundary pending>` + top-level `await`** — `ServerStats.svelte` uses `await` at the top of `<script>` (experimental flag in 5.54.x). The parent's `<svelte:boundary>` ships its `pending` snippet during the await window. **Empirically same runtime shape as `{#await}` in Svelte 5.54**: server doesn't block, pending HTML reaches the wire, resolved content materialises on the client after hydration. Author ergonomics differ (top-level await lets the rest of the script use the resolved value as a plain variable); runtime behaviour is identical at this point in Svelte's evolution.
- **`use:` actions for client-only DOM hooks** — `src/actions/track-view.ts` registers an `IntersectionObserver` on the product article via `use:trackView`. Svelte SSR runtime skips action invocations entirely, so the action body can reference DOM-only APIs without crashing render. The action's full lifecycle — mount, **update** (when bound params change reactively), destroy — is exercised end-to-end. Verified by Scenarios 18 (intersect log), 19 (SSR-safety), and 20 (update lifecycle: clicking the override button flips `trackedId` from `data.product.id` to `"999"` → `action.update({ productId: "999" })` fires on the existing observer instance, no remount, log entry confirms the new id).
- **Loader-driven HTTP** — `products.detail` throws `LoaderNotFound` for unknown ids → `entry-server.ts` maps it to `404 + text/plain`. Same pattern as `ssr/` example.
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
| Network model | Streaming | Streaming (chunked) | Streaming (chunked + selective) | **Lazy hydration only** — single response, server shell + client data |

Practical consequence: the streamed HTML body **does not** contain `data-review-id="r1"` — Svelte ships the `reviews-fallback` placeholder, the `Promise.resolve(...)` finishes during client hydration, and the browser DOM updates to the resolved `reviews-section`. The HTTP-level proof in this example's e2e suite therefore checks for the **fallback** in the response, then asserts that the **resolved sections** become visible after `page.goto(...)`. Scenario 12 captures TCP frame timings via `node:http` to make the "no progressive flush" claim falsifiable.

The plan-level decision behind this example is documented in [§5.3](../../../../../.claude/plan-ssr-dogfooding-solid-svelte-angular-ru.md): Outcome A (async SSR + `<svelte:boundary>` + `{#await}` works) is the likely default for Svelte; Outcome B (classical sync `render()` + `<svelte:boundary>` only for error handling, no streaming) is the fallback if Real-Router's lifecycle conflicts with async SSR. This implementation is Outcome A.

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
    → usePlugin(ssrDataPluginFactory(loaders))     # reuses pre-resolved data via #596 — loader skipped
    → hydrateRouter(router, window.__SSR_STATE__)  # deposits parsed state in scratchpad, calls start(state.path)
    → hydrate(App, { target: #root, props: { router } })
                                                    # claims pending DOM, starts {#await} resolution
                                                    # fetchReviews resolves Promise.resolve() on client
                                                    # → reviews-section + related-section appear
```

**Post-hydration loader skip (#596).** `hydrateRouter()` deposits the parsed `__SSR_STATE__` into a one-shot scratchpad on `RouterInternals.hydrationState` before `router.start(state.path)`. `ssr-data-plugin`'s start interceptor reads the scratchpad and writes the server-resolved value to `state.context.data` directly, skipping the loader call. Result: zero loader-driven calls on first paint after hydration. Verified by `post-hydration loader skip (#596)` Playwright tests in [`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts).

## Svelte-Specific Gotchas

- **Server does NOT block on `{#await}` resolution.** Even with `await render(...)`, deferred awaits inside template `{#await}` blocks are rendered as their pending branch and shipped immediately. The server-only delays (`setTimeout`) in `fetchReviews`/`fetchRelated` therefore do **not** hold the response — they only matter if you genuinely run them on the client (which we don't here, since the client returns `Promise.resolve()`).
- **No chunked transfer.** The HTTP response is a single buffered HTML body. `Transfer-Encoding: chunked` is **not** set. The Vue example's e2e scenario that asserts chunked + per-Suspense timing is dropped here.
- **No OOO marker proof.** Svelte does not emit `<template id="…">` patches mid-stream. The Solid e2e scenario for `<template id="…">` chunks is dropped here.
- **`hydrate()`, not `mount({ hydrate: true })`.** Svelte 5 ships them as separate top-level exports. `mount({ hydrate: true })` is the deprecated Svelte 4 API surface via `asClassComponent` compat.
- **Composables return `{ current: T }` getters.** Read inside reactive contexts (template, `$derived`).
- **Top-level `await` is gated behind `experimental.async: true`** in Svelte 5.54.x. Configured in both `vite.config.ts` (compiler, hot path) and `svelte.config.js` (svelte-check). Expect this flag to graduate to stable in a future Svelte minor; the e2e test `Scenario 16` pins current behaviour so a runtime flip surfaces honestly.
- **`<svelte:boundary pending>` does NOT block server-side render in Svelte 5.54.** The boundary's `pending` snippet is shipped to the wire just like `{#await}` would; async resolution happens on the client. The 250 ms server-side delay in `ServerStats.svelte` is harmless because `render()` doesn't wait for it. If a future Svelte release adopts "server waits before flush" semantics, the test will fail noisily — by design.
- **`$state.raw(value)` for immutable snapshots** is the Svelte 5 escape hatch when you hold a large data object that you replace wholesale rather than mutate. It skips the deep proxy that wraps regular `$state` and avoids per-property reactivity overhead. Useful for: cached loader payloads with thousands of items, large config blobs, snapshot-style undo stacks. Not used in this example because the in-memory fixtures are small — the proxy cost is invisible at this scale.
- **No production-level HTTP semantics here.** `AbortController`, `ETag`, `Cache-Control`, HEAD-handler, and per-route `<svelte:head>` are out of scope — the focus is the deferred-data + boundary contract. The Vue/React streaming counterparts document those layers; the sibling `svelte/ssr-examples/ssr/` example uses `<svelte:head>`. The `head` slot is wired here (`entry-server.ts` → `<!--ssr-head-->`), so adding `<svelte:head>` to any page works without server changes — left empty by design

## Run

```bash
pnpm dev          # Express + Vite middleware (HMR), http://localhost:3000
                  # `predev` hook runs `pnpm turbo run bundle --filter=...`
                  # so workspace deps (@real-router/svelte + plugins) are
                  # rebuilt before the dev server starts — Vite reads
                  # `dist/esm/` for `@real-router/*` imports.
pnpm build:app    # svelte-check + vite build (client + ssr bundles)
pnpm preview      # NODE_ENV=production tsx server/index.ts
pnpm test:e2e     # Playwright
```

## E2e Coverage

[`e2e/ssr-streaming.spec.ts`](e2e/ssr-streaming.spec.ts) — 20 Playwright scenarios (numbered 1–20; the file lists 1–14 then 16–19 then 15 then 20 — historical insertion order, not a gap):

- 11 baseline (404, per-request isolation, hydration round-trip, critical data in `__SSR_STATE__`, no hydration warnings, error containment via `{:catch}`, empty deferred state) — mirrors Vue/Solid where the runtime allows
- Svelte-specific: HTTP response carries the **pending fallback** (`reviews-fallback`, `related-fallback`); resolved sections appear in the browser after hydration
- **Scenario 11**: `Transfer-Encoding: chunked` is **not** set on the response (Svelte returns single buffered HTML)
- **Scenario 12 (new)**: `node:http` chunk-timing reproducer — empirical proof that body lands in 1 TCP frame with ~0 ms span. Falsifies any future "Svelte is now streaming" regression.
- **Scenario 13 (new)**: typed `LoaderNotFound` for unknown product id → `404 + text/plain`. Demonstrates that loader-driven HTTP semantics still work in the deferred-data pipeline.
- **Scenario 14 (new)**: documents that this example **does not** register `browser-plugin` — Link clicks change router state via `preventDefault + router.navigate()`, but the URL bar stays put and `state.context.data` is undefined (ssr-data-plugin SSR-only contract). CSR with full URL sync is the `ssr/` example's job.
- **Scenario 15 (new)**: `<svelte:boundary>` end-to-end — clicking the trigger throws inside a child's `$derived.by()`, the boundary catches the throw and renders the `@failed` snippet; rest of the page (product detail, reviews, related) stays mounted; `reset` restores the original tree.
- **Scenario 16 (new)**: `<svelte:boundary pending>` + top-level `await` in `ServerStats.svelte` (gated behind `experimental.async: true` — see `vite.config.ts` + `svelte.config.js`). SSR response ships the `stats-pending` snippet, NOT the resolved `server-stats` section — empirical proof that Svelte 5.54 does **not** wait for top-level await on the server. Resolved content materialises after client hydration. If a future Svelte release flips to "server waits before flush" this assertion fails honestly.
- **Scenario 17 (new)**: `<svelte:boundary onerror>` callback — production observability hook fires before `@failed` renders. Spied via `console.error` (would be Sentry/Datadog in production). Asserts the error message reaches the callback verbatim.
- **Scenario 18 (new)**: `use:trackView` action — `IntersectionObserver`-based view tracking, populates `window.__VIEW_LOG__` on hydration. Demonstrates the SSR-safe-by-construction property of Svelte actions (server runtime never invokes them, so `window` references can't crash render).
- **Scenario 19 (new)**: SSR-safety proof for the same action — server response contains zero references to `__VIEW_LOG__` / `IntersectionObserver`. Closes the loop on "actions are safe in SSR" claim.
- **Scenario 20 (new)**: `use:trackView` update lifecycle — `manualOverride` (`$state`) flips `trackedId` from `data.product.id` to `"999"` → `action.update({ productId: "999" })` fires on the existing observer instance, no remount. Verified via `window.__VIEW_UPDATE_LOG__` (separate from `__VIEW_LOG__` which tracks intersect events).
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
