# Preact SSR Examples

> Server-rendering with Real-Router and Preact 10 across four delivery models — classical SSR, HTTP-streaming SSR, static site generation, and hybrid per-route mode.

Four standalone Vite apps. Each one is a real, e2e-tested dogfooding consumer of `@real-router/*` for a specific server-rendering shape; this document is the synthesis of what the router can and cannot do on Preact 10, sourced exclusively from the four child READMEs.

| Subdir | Demonstrates |
|---|---|
| [`ssr/`](./ssr) | Classical per-request `cloneRouter(base, { currentUser, abortSignal })` → `usePlugin(ssrDataPluginFactory)` → `start(url)` → **`renderToStringAsync`** (Preact-unique async-single-shot SSR — awaits `lazy()` and inlines resolved content into one complete HTML string, no chunked transfer). `serializeRouterState` + `hydrateRouter` + Preact `hydrate(vnode, parent)`. Auth + role gates via `canActivate` + DI; typed loader errors → 301/302/404/504; per-route meta with absolute canonical + og; production HTTP: sha256 strong **ETag**, per-route `Cache-Control`, `AbortController` threaded into loader DI. `useId()` proves SSR/CSR id parity (since `preact-render-to-string@6.6.5`, Dec 2025). |
| [`ssr-streaming/`](./ssr-streaming) | Preact 10 streaming via `renderToReadableStream` (since `preact-render-to-string@6.5.x`, Jan 2025) over `Transfer-Encoding: chunked`. `ssr-data-plugin` resolves critical product data before shell renders; reviews + related items are deferred via `defer({ critical, deferred })` and consumed through `<Await name>` + `<Streamed>` from `@real-router/preact/ssr` (Suspense-thenable convention since Preact has no `use(promise)`). Inline `<script>__rrDefer__("key", json)</script>` settle scripts, emitted by `injectDeferredScripts`, ride the same chunked transfer. **Out-of-order streaming for `lazy()` boundaries via `<preact-island>` custom element** (since `@6.6.x`) — server emits `<!--preact-island:-N-->` open marker + inline fallback, then a trailing `<preact-island hidden data-target="-N">…</preact-island>` chunk after the dynamic import resolves; the custom element's `connectedCallback` swaps fallback ↔ resolved client-side without framework intervention. |
| [`ssg/`](./ssg) | Build-time pre-rendering: `getStaticPaths(router, entries)` → `cloneRouter` + `start` + `renderToString` per URL → write `dist/{url}/index.html`. Nested SSG (`users.profile.posts` → 8 paths total: 1 home + 1 list + 3 profiles + 3 posts), per-id absolute canonical + og, `404.html`, `sitemap.xml`. `LoaderNotFound` at build time aborts loudly with non-zero exit. Preview: per-route `Cache-Control` (custom `ssgServe()` Vite middleware) + weak `ETag` from file mtime. |
| [`ssr-mixed/`](./ssr-mixed) | Per-route SSR mode (#597) — four routes × four config shapes on one `entry-server.tsx`: `home` short-form (full), `admin.dashboard` `{ ssr: false }` (client-only), `users.profile` `{ ssr: "data-only", loader }`, `docs.detail` `{ ssr: (state) => …, loader }` (function-form). `entry-server.tsx` reads `getSsrDataMode(state)` and either `await renderToStringAsync(<App/>)` (full, Preact-unique async-single-shot SSR) or emits `<div data-ssr-shell data-ssr-mode="…">` shell. 4 e2e scenarios verify each mode's HTTP response shape. Composes with #596: hydration scratchpad reuse for `full`/`data-only`; `client-only` skips loader unconditionally. |

## Capabilities

What Real-Router actually delivers on Preact 10 across these three shapes, grouped by concern. Each item is sourced from one or more child READMEs.

**Per-request isolation.** `cloneRouter(base, deps?)` produces an isolated router per request; the three examples all dispose it in `finally` so a typed-error short-circuit, a streaming pump exit, or a client disconnect never leaks state. The DI seam carries `currentUser`, `abortSignal`, and other per-request values; `entry-client.tsx` mirrors the same DI wiring (over `document.cookie`) so post-hydration guard checks see the same values as the SSR pass.

**Single data-loading plugin shape.** `@real-router/ssr-data-plugin` writes plain JSON-shaped data into `state.context.data` for all three pipelines. It is a start-interceptor plugin and ships a typed-errors subpath (`@real-router/ssr-data-plugin/errors`) with `LoaderNotFound`/`LoaderRedirect`/`LoaderTimeout` + `withTimeout` helper. Unified across `ssr/`, `ssr-streaming/`, and `ssg/` — application catch-paths look identical regardless of pipeline shape.

**State serialization + hydration.** `serializeRouterState()` is XSS-safe; the resulting blob lands in `window.__SSR_STATE__`. `hydrateRouter(router, ssrState)` deposits the parsed state into a one-shot scratchpad on `RouterInternals.hydrationState` and calls `router.start(state.path)` once on the client; `ssr-data-plugin`'s start interceptor reads the scratchpad and reuses the server-resolved `state.context.data` directly, skipping the loader call (#596). Preact's `hydrate(vnode, parent)` reuses server-rendered DOM without mismatch. SSG additionally auto-detects the SSG vs dev path: `if (rootElement.firstElementChild)` → `hydrate()`; else → `render()` — same `entry-client.tsx` works for SSG-built pages and Vite dev fallbacks.

**Three Preact rendering modes, one router contract.** The router is identical across pipelines; the renderer is the variable:

| Renderer | Output | Lazy/Suspense behaviour | Used in |
|---|---|---|---|
| `renderToString` (sync) | full HTML string | fallback emitted; lazy boundary deferred | `ssg/` (every URL pre-rendered at build time) |
| **`renderToStringAsync`** | full HTML string | awaits, inlines resolved content | `ssr/` (single-shot async SSR; no `Transfer-Encoding: chunked`) |
| `renderToReadableStream` | `ReadableStream<Uint8Array>` | fallback inline + `<preact-island>` swap chunk | `ssr-streaming/` (TTFB-sensitive UX) |

The middle one is **Preact-only**: React 19's `react-dom/server` has no sync-with-async-data equivalent — to await in-tree promises in React you must opt into a streaming pipeline.

**Typed HTTP error model.** Loader errors have explicit codes that map to HTTP responses (ssr `entry-server.tsx` dispatch table): `CANNOT_ACTIVATE` → 302, `LOADER_REDIRECT` → 301/302, `LOADER_NOT_FOUND` → 404 text/plain, `LOADER_TIMEOUT` → 504 text/plain. Streaming pipeline catches `LoaderNotFound` **before** constructing the stream — short-circuit to plain-text 404 keeps `cleanup()` reachable; without the typed-error path, a generic throw would bubble past the streaming catch site and skip `router.dispose()`, leaking the per-request router. At build time in SSG, an unexpected `LoaderNotFound` aborts the build with a non-zero exit instead of silently emitting a "user not found" page for a stale `entries.ts` id.

**Build-time path enumeration.** `getStaticPaths(router, entries)` walks the route tree and returns **leaf** paths only. Application code in `ssg-build.ts` derives intermediate parent URLs from the leaves (e.g. `/users/:id` from `/users/:id/posts` by suffix-stripping) and adds purely-parent pages (e.g. `/users` for `UsersList`) manually. The 8-URL output for the SSG demo is `1 home + 1 list + 3 profiles + 3 posts`, not "every URL the tree could produce".

**Per-route HTTP semantics, per pipeline.** All three examples drive `Cache-Control` from a single `cache-policies.ts` lookup. The HTTP envelope differs by pipeline:

| Pipeline | `Cache-Control` | `ETag` | `AbortController` |
|---|---|---|---|
| `ssr/` (renderToStringAsync) | per-route | strong sha256 (16 base64url chars) | threaded into loader DI via `cloneRouter(base, { abortSignal })`; `slow` loader pulls via `getDep("abortSignal")` and forwards as `withTimeout(..., { upstreamSignal })` (#598) — composed signal cancels upstream `fetch` on deadline or client disconnect |
| `ssr-streaming/` (renderToReadableStream) | per-route, applies to streamed responses | not asserted (streamed body) | `cleanup()` runs in `finally` so router disposal never leaks |
| `ssg/` (build-time) | per-route via `ssgServe()` Vite middleware | weak, derived from file mtime by Vite preview | not applicable (pre-rendered) |

**Auth + role gates.** `canActivate` guards read DI via `getDep(...)`; `cloneRouter` is the injection seam. `entry-client.tsx` mirrors the server's cookie → `currentUser` resolver so the post-hydration client guard sees the same DI value as SSR (otherwise client-side guard checks would diverge). Demonstrated by `/dashboard` (auth) and `/admin` (role) routes.

**Per-route SSR mode (#597).** `@real-router/ssr-data-plugin` accepts a per-route `{ ssr?, loader? }` config that branches the server pipeline by `SsrMode`: `"full"` (run loader + render), `"data-only"` (run loader, ship JSON only, shell HTML), `"client-only"` (skip loader, ship shell, application fetches client-side). `ssr: false` aliases `"client-only"`; `ssr: true` aliases `"full"`. Function form `(state) => SsrMode` resolves per-navigation. The plugin publishes the resolved mode to `state.context.ssrDataMode`; `entry-server.tsx` reads it via `getSsrDataMode(state)` to branch between `await renderToStringAsync(<App/>)` (full) and a shell `<div data-ssr-shell data-ssr-mode="…">` placeholder. The `ssr-mixed/` example demonstrates all four config shapes on one server. Composes with #596: hydration scratchpad reuse applies when mode allows the loader; `client-only` skips the loader unconditionally regardless of scratchpad contents (mode wins).

**SEO/head plumbing.** Per-route `meta` resolver returns a `PageMeta` block — `{ title, description, canonical, ogTitle, ogDescription }` (5 fields; `og:url` is rendered from `canonical`, not stored separately). The server renders the block as 6 tags and splices the result into the HTML head. Canonical URLs are absolute (`SITE_ORIGIN`-prefixed, default `https://example.com`). SSG additionally emits `sitemap.xml` from the same URL set, with per-id canonicals (not the parent `/users` URL) — `meta.ts:62-86` builds them via `abs(\`/users/${id}\`)` and `abs(\`/users/${id}/posts\`)`.

**`useId()` SSR-stable form IDs.** `SearchForm.tsx` uses Preact's `useId` for `<label htmlFor>` ↔ `<input id>` pairing. Returns a stable per-component-instance ID; SSR and client produce identical values, no hydration mismatch. Available since `preact-render-to-string@6.6.5` (Dec 2025) — same hook name as React 18+, maps semantically to React's `useId`.

## Limitations

Each item is categorised: **(framework-side)** — Preact 10 / `preact-render-to-string` / streaming constraint not under Real-Router's control; **(design choice)** — deliberate Real-Router (or plugin) omission with documented rationale, often closeable by user-side composition.

- **(framework-side) No `use(promise)` hook for in-component data deferral.** Preact 10 does not ship `use(promise)`. **Workaround used in `ssr-streaming/`:** `<Await>` from `@real-router/preact/ssr` implements the React 19 `use()` semantics via thenable-throw + `.status`/`.value`/`.reason` tagging on the deferred promise (the same shape React 19's internal `use()` cache uses). Reviews + RelatedItems are wired through `defer({ deferred: { reviews, related } })` server-side; the cross-adapter inline-script settle scripts (`<script>__rrDefer__("key", json)</script>`) flow through unchanged. v11 may add native `use(promise)` and replace the convention.
- **(framework-side) Async function components silently skip in `renderToReadableStream`.** Empirically: the renderer treats async returns as `undefined` and emits no markup. Documented in `ssr-streaming/README.md` "What's still beyond Preact 10" — do not use async function components in Preact 10 streaming pipelines.
- **(framework-side) Selective hydration is partial.** Out-of-order streaming exists for `lazy()` boundaries via `<preact-island>` (since 6.6.x), but arbitrary `<Suspense>` boundaries do not get the same swap mechanism. Broader story is announced for v11.
- **(framework-side) No React Server Components.** Preact does not implement RSC. The `ssr/` README states this explicitly; there is no `ssr-rsc/` example in this directory tree. See "Why no `ssr-rsc/`?" below.
- **(framework-side) `withTimeout()` cancellation is cooperative.** When the deadline elapses, the loader's `{ signal }` aborts *before* the race rejects with `LoaderTimeout`; loaders that thread `signal` into their I/O actually cancel the underlying work. Loaders that don't propagate the signal still run to completion in the background. The `slow` loader in `ssr/` composes the deadline with `options.upstreamSignal` (client-disconnect from per-request DI).
- **(design choice) `ssr-data-plugin` (boot-path) and `lifecycle-plugin onNavigate` (CSR navigation) split the lifecycle by phase, on purpose.** `ssr-data-plugin` intercepts `router.start()` — runs once during SSR; on the client, `hydrateRouter(router, ssrState)` deposits the parsed state into a one-shot scratchpad and the plugin reuses the server-resolved `state.context.data` directly (#596) instead of calling the loader again. CSR navigations via `<Link>` do NOT re-run its loader; that is `lifecycle-plugin.onNavigate`'s job, and the canonical CSR+SSR stack composes both plugins. Single-responsibility per plugin keeps SSG-only build scripts and pure-CSR SPAs from carrying interception code they don't use.

### Why no `ssr-rsc/`?

Preact 10 does not support React Server Components, per the explicit note in [`ssr/README.md`](./ssr/README.md) ("**No RSC**: Preact does not support React Server Components"). The `react-server-dom-*` Flight protocol is React-specific at the wire level, so `@real-router/rsc-server-plugin` (which produces a React `ReactNode` payload) is not portable to Preact. If you need RSC, use the React adapter — see [`../../react/ssr-examples/ssr-rsc/`](../../react/ssr-examples/ssr-rsc).

## Preact-unique aspects

What's specific to the Preact 10 adapter, expressed as Real-Router integration points rather than Preact theory:

- **`renderToStringAsync` is a third SSR mode that React does not have.** `ssr/` uses it to await a `lazy(() => import("./Tagline"))` boundary inside the render call and inline the resolved content into one complete HTML string. Response carries `Content-Length`, **not** `Transfer-Encoding: chunked`. The router does nothing different — same `cloneRouter` + `start` + `renderToString*` shape — but the choice of renderer lets the application avoid a streaming pipeline while still resolving in-tree async components.
- **`<preact-island>` is the wire signature of out-of-order streaming on Preact 10.** Functionally equivalent to React 19's `<!--$?-->` placeholder + `<template id="B:0">` mechanism; verified end-to-end by 4 dedicated e2e tests in `ssr-streaming/`. Real-Router contributes nothing to this — it is a `preact-render-to-string` capability — but the streaming example proves the integration: the router pipes its renderer output through Express unchanged, the custom-element bootstrap script lands in the response, and hydration completes without intervention.
- **Bundle-size headroom.** `ssr/README.md` notes a ~3-4× smaller client bundle vs the React equivalent (Preact 10 is ~3 KB gzipped). Real-Router's footprint is identical across adapters, so adapter choice is the lever.

## Empirical findings

Findings that the three READMEs flag as non-obvious, empirically-verified, or footgun-class — distilled here so adapter-shopping readers don't have to re-discover them.

1. **`<preact-island>` out-of-order streaming exists in Preact 10 for `lazy()` boundaries — verified empirically.** The Preact-www v10 docs warn about hydration that "can pause and wait for JS chunks", widely read as "no out-of-order Suspense in v10". That warning is about hydration semantics, not the streaming wire signature. The wire signature is alive: server emits open/close markers + inline fallback, then a trailing `<preact-island>` chunk + custom-element bootstrap that swaps fallback ↔ resolved client-side. Verified by 4 e2e tests in `ssr-streaming/`.

2. **Async function components silently skip in `renderToReadableStream`.** Empirical finding documented in `ssr-streaming/`: the renderer treats async returns as `undefined`. Do not use async function components in Preact 10 streaming pipelines — they fail without an error.

3. **`lazy(() => import("./X"))` caches at module scope — fallback emitted only on first SSR after server start.** Same pitfall as `React.lazy`. The streaming e2e suite deliberately does **not** assert "fallback always present" because that would be flaky against the cache; instead it asserts what holds regardless of cache state (resolved content present, code-split chunk on disk, fallback↔bootstrap consistency).

4. **Two-versions-of-Preact is the canonical Vite-monorepo-Preact pitfall.** `@real-router/preact`'s `peer preact >= 10.0.0` lets two copies of preact (e.g. one from the adapter's devDeps + a different version pinned in the example) both end up in the bundle, producing two hook runtimes and `Cannot read properties of undefined (reading '__H')` on hydration. Fix: `resolve.dedupe: ["preact", "preact/hooks", "preact/jsx-runtime"]` in the example's `vite.config.ts`. **All three SSR examples ship this fix** — required pattern for any Preact monorepo example using `@real-router/preact`.

5. **SSG without typed `LoaderNotFound` silently ships broken pages.** A stale id in `entries.ts` (corresponding row deleted from the database) makes the loader resolve `user: undefined`; the build emits a "user not found" page for the stale id and serves it as 200 with empty content. With the typed error, the build aborts with non-zero exit. Documented as a real failure mode in `ssg/README.md`, verified by an e2e test that imports the compiled `entry-server.js` and asserts the rejection.

## See Also

- [`@real-router/preact`](../../../../packages/preact) — adapter package (`RouterProvider`, `RouteView`, `Link`, hooks)
- [`@real-router/ssr-data-plugin`](../../../../packages/ssr-data-plugin) — JSON-shaped per-route data loading (used by all three pipelines)
- [`@real-router/ssr-data-plugin/errors`](../../../../packages/ssr-data-plugin/src/errors.ts) — typed loader errors (`LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, `withTimeout`)
- [`@real-router/browser-plugin`](../../../../packages/browser-plugin) — client-side URL sync after hydration
- [React SSR examples](../../react/ssr-examples) — full feature parity reference, plus `ssr-rsc/` for React Server Components
- [Preact SSR Guide v10](https://preactjs.com/guide/v10/server-side-rendering/) — official docs noting v10 hydration limits
- [`preact-render-to-string` releases](https://github.com/preactjs/preact-render-to-string/releases) — streaming added in 6.5.x, `useId` in 6.6.5, `<preact-island>` in 6.6.x
- [Preact Server Components discussion](https://github.com/preactjs/preact/discussions/2879) — context for "no RSC" position
