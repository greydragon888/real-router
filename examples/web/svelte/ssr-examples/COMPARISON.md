# SSR / SSG Comparison — @real-router/svelte vs svelte-spa-router

> Authoritative source for Real-Router capabilities: [`README.md`](./README.md) (synthesised from the four child READMEs in [`ssr/`](./ssr), [`ssr-streaming/`](./ssr-streaming), [`ssg/`](./ssg), [`ssr-mixed/`](./ssr-mixed)).
> Competitor data sourced from official docs accessed via Context7 on **2026-05-06**:
> - `svelte-spa-router` repo + docs: https://github.com/italypaleale/svelte-spa-router, https://github.com/italypaleale/svelte-spa-router/blob/main/Advanced%20Usage.md

## Honest scope disclosure

**There is no standalone, SSR-capable Svelte router that is apples-to-apples with `@real-router/svelte`.** The Svelte ecosystem has invested its SSR effort almost entirely in **SvelteKit**, which is a meta-framework — it bundles routing with a server runtime, file-based routing, build orchestration, and deployment adapters. SvelteKit is excluded from this comparison by the same rule that excludes Next.js, Nuxt, SolidStart, Analog, and Expo Router.

Outside SvelteKit the standalone Svelte routers are:

| Router | SSR? | Notes |
|---|---|---|
| `svelte-spa-router` | **No** — hash-based, SPA-only by explicit design | Closest in mindshare; comparison below uses it as the routing-only baseline |
| `svelte5-router` (`@mateothegreat/svelte5-router`) | No SSR documented | Nested SPA router for Svelte 5; not in scope |
| `svelte-mini-router` | No SSR documented | Minimal Svelte 5 SPA router; not in scope |
| `keenmate/svelte-spa-router` | No SSR documented (dual-mode hash + history, but client-only) | Not the package referenced when people say "svelte-spa-router"; not in scope |

This document therefore compares **the routing surface** of `@real-router/svelte` against `svelte-spa-router`, and **declares as gaps** every SSR/SSG axis that `svelte-spa-router` does not address. It is not a comparison of equivalent products — it is the most honest "standalone alternative in the Svelte ecosystem" the prompt allows.

> Excluded by the prompt's no-meta-framework rule: **SvelteKit** (the closest functional SSR/SSG counterpart in the Svelte ecosystem). Readers comparing against SvelteKit explicitly should consult SvelteKit's own docs; the comparison below stays inside the standalone-router category.

## TL;DR

`svelte-spa-router` is a small, focused **hash-based SPA router**: routes are an object/Map mapping path patterns to components, lifecycle callbacks fire on load, and the wire format is `#/page`. It does **not** ship per-route loaders, SSR, SSG, hydration, typed errors → HTTP, or any server-side concept — and that is its design. **Real-Router on Svelte 5 ships four dogfooded delivery shapes** (`render` for SSR with strong sha256 ETag, deferred-data SSR via `{#await}` / `<svelte:boundary>`, build-time SSG with `getStaticPaths` leaf-only, and a hybrid per-route mode example), wires `ssr-data-plugin` loaders into all of them, codifies a typed-error → HTTP envelope, threads `AbortController` into loader DI, and keeps the same plugin contract that ports across React/Vue/Solid/Preact/Angular. **`svelte-spa-router` "wins" only by being smaller in scope** (one file, no plugins, no SSR concerns); on every SSR/SSG axis it is silent because it does not address the problem space. **Real-Router wins on every SSR/SSG axis by default**, but readers who only need a CSR-only hash router for a static deployment will find `svelte-spa-router` denser per byte. Svelte 5 framework limits (single buffered HTML body, no chunked HTTP streaming, no out-of-order placeholders, atomic `hydrate()`) constrain Real-Router on Svelte equally — `ssr-streaming/` is **deferred-data SSR**, not progressive HTTP flush, and the README documents this falsifiably with a `node:http` reproducer (Scenario 12: 1 TCP frame, ~0 ms span).

## Feature Matrix

Symbols: ✓ built-in, ⚠ partial / via composition, ✗ not provided / out of scope by design, n/a not applicable.

| Feature | @real-router/svelte (+ ssr-data-plugin) | svelte-spa-router |
|---|---|---|
| **Classical SSR** (`render` from `svelte/server`) | ✓ `ssr/` example: `cloneRouter` → `usePlugin(ssrDataPluginFactory)` → `start(url)` → `await render(App, { props })` → `serializeRouterState` → `hydrateRouter` + `svelte.hydrate(App, { target, props })` | ✗ — explicit non-goal: hash-based SPA router; SSR is not addressed |
| **Streaming SSR** (HTTP progressive flush) | ✗ Svelte 5 framework-side limit: single buffered body, 1 TCP frame, ~0 ms span (verified by `node:http` reproducer in [`ssr-streaming/README.md`](./ssr-streaming/README.md), Scenario 12). The "streaming" example is **deferred-data SSR**, not progressive flush | ✗ — same framework-side limit; `svelte-spa-router` is CSR-only regardless |
| **Deferred-data SSR** (`{#await}` + `<svelte:boundary>`) | ✓ `ssr-streaming/` example: server emits the pending fallback in one buffered body; `{:then}` resolution runs on the client after hydration; `<svelte:boundary>` covers reactive/render-time errors with `@failed` snippet + `reset` + `onerror` (production observability); `<svelte:boundary pending>` + top-level `await` (gated behind `experimental.async: true` in Svelte 5.54.x) | ✗ — no SSR pipeline at all |
| **SSG / build-time prerender** | ✓ `ssg/` example: `getStaticPaths(router, entries)` returns leaf paths; app derives parent URLs; 8 pre-rendered URLs (1 home + 1 list + 3 profiles + 3 posts); per-page meta with 9 tags + per-id absolute canonical; **SSG loaders are tolerant by example design** (return `user: undefined` for unknown ids; fail-fast guard wired but dormant) | ✗ — no build-time prerender; deployment is static SPA shell only |
| **ISR / on-demand revalidation** | ✗ not provided (HTTP-cache-driven via per-route `Cache-Control` only) | ✗ |
| **RSC / Server Components** | n/a — Svelte does not implement RSC; explicitly documented in [`README.md`](./README.md#why-no-ssr-rsc); use the React adapter if RSC is required | n/a |
| **Islands / partial hydration** | ✗ Svelte 5 stable does not implement selective hydration — `hydrate()` claims the full tree atomically (framework-side) | ✗ — no SSR/hydration pipeline |
| **Selective SSR per route** (#597) | ✓ `ssr-mixed/` example via `ssrDataPluginFactory` `{ ssr?, loader? }`: `"full"` / `"data-only"` / `"client-only"` (or `true`/`false` aliases) **plus function form** `(state) => SsrMode` resolving per-navigation; `getSsrDataMode(state)` reads the resolved mode in `entry-server.ts`. Composes with #596 hydration scratchpad reuse | ✗ — CSR-only, no SSR concept at all |
| **Per-route loader API** | ✓ `ssr-data-plugin` writes per-route data into `state.context.data`; loader receives DI from `cloneRouter(base, { currentUser, abortSignal })` | ✗ — no loader concept; data fetching is component-level (e.g. inside `onMount` or `$effect`) |
| **Where loaders run** | Server at boot/SSG; on the client `hydrateRouter` reuses pre-resolved `state.context.data` via the `RouterInternals.hydrationState` scratchpad (#596) — loader skipped on first paint; CSR navigations require `lifecycle-plugin.onNavigate` by design | n/a |
| **Loader → component plumbing** | `state.context.data` (read via plugin-provided helper or directly off router state via `useRoute()` getter) | n/a — components receive `params` prop only |
| **Parallel vs waterfall** | Per-route loaders are independent functions; orchestration is application-level | n/a |
| **Race / cancellation** | `withTimeout()` (#598) passes `{ signal }` to the loader: composed `AbortSignal` aborts on the deadline OR on `options.upstreamSignal` (client disconnect from `cloneRouter(base, { abortSignal })` per-request DI), abort fires *before* race rejection — loaders threading `signal` into I/O actually cancel | n/a — no fetch layer at the router level |
| **Hydration transport** | `serializeRouterState()` → inline `<script>window.__SSR_STATE__ = …</script>` (XSS-safe); client `hydrateRouter(router, ssrState)` re-runs `router.start(path)`. Svelte 5 explicit: `hydrate` ≠ `mount` (no `mount({ hydrate: true })` option); SSG dual-mode mount: `if (rootElement.firstElementChild) hydrate(...) else mount(...)` | ✗ — no hydration pipeline |
| **Serialisation pluggability** | Default `JSON.stringify`/`JSON.parse` (XSS-safe). Pluggable via `{ serialize, deserialize }` options on `serializeRouterState`/`hydrateRouter` for non-JSON types (Date / Map / Set / RegExp / BigInt) — pair with `devalue` or `superjson` (peer dep, not bundled). XSS-escape applies to custom-serializer output regardless (#606) | n/a |
| **Mismatch handling** | Svelte's `hydrate()` claims existing DOM atomically; SSG dual-mode mount handles dev fallback | n/a |
| **In-flight dedup** | ✗ not provided by core or `ssr-data-plugin`; compose with `lifecycle-plugin.onNavigate` + a CSR fetcher | ✗ |
| **TTL / SWR cache** | ✗ not provided; per-route `Cache-Control` is the HTTP-side knob | ✗ |
| **Cross-navigation cache reuse** | Application-level | ✗ |
| **Manual invalidation** | `router.navigate(name, params, search, { reload: true })`; CSR refetch via `lifecycle-plugin.onNavigate` | ✗ |
| **Suspense integration** | Svelte 5 `{#await}` blocks for promise-driven content; `<svelte:boundary>` for reactive errors | n/a |
| **Out-of-order streaming** | ✗ framework-side limit (Svelte 5 stable) | ✗ |
| **Backpressure / abort on stream** | n/a (no progressive flush); per-request `AbortController` covers HTTP-level cancellation in `ssr/` | n/a |
| **Per-route error boundary** | Application-level Svelte `<svelte:boundary>` (the README documents `@failed` snippet + `reset` callback + `onerror` for production observability); router itself does not own error boundaries | ⚠ `onConditionsFailed` callback fires when route preconditions fail; no per-route error boundary primitive |
| **Typed loader errors → HTTP** | ✓ `LoaderRedirect` → 301/302, `LoaderNotFound` → 404 text/plain, `LoaderTimeout` → 504 text/plain, `CANNOT_ACTIVATE` → 302; **opted in for `ssr/` and `ssr-streaming/`, dormant in `ssg/`** by example design | ✗ — no HTTP concept |
| **SSG build-time error semantics** | ⚠ fail-fast guard wired (`process.exit(1)` on any throw) but **dormant under tolerant loaders** by example design (Svelte SSG returns `user: undefined`, matching Solid/Angular and diverging from Vue/React); opting in is a one-file change | ✗ — no SSG |
| **Type-safe params** | Provided by core route-tree types (not asserted in this README for SSR specifically) | ⚠ `params` is `Record<string, string>` (regex routes return `RegExpExecArray` with named groups); generic typing is user-side |
| **Type-safe search params** | Available via `@real-router/search-schema-plugin` (separate package, not part of the SSR README) | ✗ — `querystring` is a raw string passed via callback |
| **File-based vs config-based** | Config-based (route tree built explicitly) | Config-based (object or `Map` of path patterns to components); no file-based variant |
| **Plugin extension points (server path)** | ✓ first-class: `claimContextNamespace` + `usePlugin` + `addInterceptor`; `ssr-data-plugin`, `lifecycle-plugin`, `validation-plugin`, `search-schema-plugin`, `browser-plugin` share this protocol | ✗ — no plugin protocol; the router exposes `onRouteLoading` / `onRouteLoaded` / `onConditionsFailed` callbacks only |
| **Auth / role gates** | ✓ `canActivate` reads DI via `getDep("currentUser")`; `cloneRouter(base, { currentUser })` is the injection seam; `entry-server/_auth.ts` and `entry-client.ts` mirror cookie parsing for guard parity | ⚠ "protected routes" via component-level conditional rendering; route definitions support a `conditions` array (function-based) that can reject navigation, but no DI |
| **Custom directives in SSR** | ✓ `use:` actions exercised end-to-end including `update` lifecycle (Scenario 20 in `ssr-streaming/`: `action.update({ productId: "999" })` fires on existing observer instance, no remount); Svelte runtime skips action invocations on the server (DOM-only APIs are safe) | ✓ Svelte directives are framework-side; same applies on the client |
| **`<svelte:head>` declarative head** | ✓ collected into `RenderOutput.head`, spliced through `<!--ssr-head-->`; SSG combines `<svelte:head>` and an explicit meta-resolver block via `<!--ssr-meta-->` | ⚠ `<svelte:head>` works at the component level on the client; no SSR collection |
| **Server runtime lock-in** | None enforced — Express in the examples; Svelte's `render()` returns `RenderOutput = SyncRenderOutput & PromiseLike<SyncRenderOutput>`, portable to Hono/Bun/Edge | n/a — CSR only |
| **Bundle (SSR-relevant surface, gzip)** | Real-Router adds `@real-router/core` + `@real-router/svelte` + `ssr-data-plugin` (+ `browser-plugin`) on top of `svelte/server`; per-package `size-limit` budgets in `.size-limit.js` are the canonical figure | Smallest of the two — `svelte-spa-router` is one of the smallest SPA routers in any ecosystem; bundlephobia is the canonical figure |
| **Tree-shake unused render modes** | ✓ each delivery mode is a separate plugin/example; CSR-only apps pull none of the SSR-side plugins | ✓ no per-mode runtime — only one mode (hash CSR) |
| **CSR app → add SSR without rewriting routing** | ✓ same `RouterProvider` / `RouteView` / `Link` work; SSR-only code is the `entry-server.ts` + plugin layer | ✗ — adding SSR requires switching routers entirely; `svelte-spa-router` has no upgrade path to SSR |
| **Same router code in CSR / SSR / SSG without forks** | ✓ three shipped examples reuse the same route-tree, the same loader shape, and the same hydration entry; SSG additionally reuses `entry-client.ts` via the dev-vs-SSG dual-mode check | n/a — only CSR |
| **Hash routing** | ⚠ available via `@real-router/hash-plugin` (separate package); the SSR examples use history routing | ✓ default and only mode (hash-based) |
| **Lifecycle callbacks** | Plugins (`lifecycle-plugin onNavigate` / `subscribeLeave` / `onTransitionError`) | ✓ `onRouteLoading` / `onRouteLoaded` / `onConditionsFailed` are simple callback props on `<Router>` |
| **Scroll restoration** | Available via `@real-router/scroll-restoration-plugin`-style composition (`ssr-examples` do not exhibit it) | ✓ `restoreScrollState={true}` prop on `<Router>` |

## Where Real-Router wins

- **It addresses the SSR/SSG problem space at all.** [`README.md`](./README.md) — three dogfooded delivery shapes (classical SSR, deferred-data SSR, SSG) with e2e tests. `svelte-spa-router` is by explicit design a hash-based CSR-only SPA router; the `Summary` line in its docs reads: *"svelte-spa-router is ideal for building static Single Page Applications (SPAs) without server-side rendering"* (retrieved 2026-05-06). For any application that needs SSR or SSG without adopting SvelteKit, `svelte-spa-router` is silent on every requirement.
- **Per-route loaders with typed loader-error → HTTP envelope.** `LoaderRedirect`/`LoaderNotFound`/`LoaderTimeout`/`CANNOT_ACTIVATE` map to 301/302/404/504/302 in the `entry-server.ts` dispatch table; the deferred-data pipeline catches `LoaderNotFound` **before** rendering so `cleanup()` always runs. `svelte-spa-router` has no loader concept and no HTTP-status concept.
- **Build-time path enumeration with leaf-only contract and optional fail-fast.** `getStaticPaths(router, entries)` returns leaves; `ssg-build.ts` derives parent URLs in user code; the fail-fast guard is wired but dormant under the example's tolerant loaders — opting into the strict `LoaderNotFound` path activates it without library changes. `svelte-spa-router` ships no SSG enumeration.
- **Per-pipeline HTTP envelope is documented, not accidental.** The `Cache-Control` / `ETag` / `AbortController` table in [`README.md`](./README.md#capabilities) codifies three deliberate HTTP contracts (strong sha256 ETag for `ssr/`, intentionally narrow envelope for `ssr-streaming/`, none for `ssg/` by example-design divergence). `svelte-spa-router` does not own HTTP concerns.
- **Per-request `AbortController` threaded into loader DI + composed via `withTimeout`.** `cloneRouter(base, { abortSignal })` + `getDep("abortSignal")` + `withTimeout(..., { upstreamSignal })` (#598) gives the `slow` loader in `ssr/` a single composed `AbortSignal` that fires on deadline or client disconnect; threaded into `fetch(..., { signal })` it cancels at the network layer (manual `as unknown as` cast documented in `loaders.ts` because `cloneRouter` deps are `Record<string, unknown>`). `svelte-spa-router` has no fetch layer to cancel.
- **`canActivate` + DI guards with mirrored client cookie parsing.** Auth/role gating reads DI via `getDep("currentUser")`; `entry-server` and `entry-client` mirror cookie parsing through shared `_known-users.ts` so post-hydration `canActivate` outcomes match the SSR pass. `svelte-spa-router`'s `conditions` array is a CSR-only function check.
- **Public plugin protocol with cross-adapter consistency.** `claimContextNamespace` + `usePlugin` + `addInterceptor` is the same surface every shipped plugin uses; the same `ssr-data-plugin` shape works on React, Vue, Solid, Svelte, Preact, and Angular. `svelte-spa-router` has callbacks (`onRouteLoading`, `onRouteLoaded`, `onConditionsFailed`) but no plugin protocol.
- **`<svelte:head>` collected through `RenderOutput.head` for SSR.** `render()` aggregates `<svelte:head>` blocks into the head field; the server splices it through `<!--ssr-head-->`. SSG additionally renders 9 SEO tags including OpenGraph + Twitter Card. `svelte-spa-router` has no SSR pipeline to aggregate into.
- **Snippet-based `<RouteView>` matches Svelte 5 idioms.** `{#snippet name()}{/snippet}` blocks named after route segments; `notFound` and `self` reserved. `svelte-spa-router` predates Svelte 5 snippets and uses prop-driven component injection.
- **Selective SSR per route (#597).** `ssrDataPluginFactory` accepts `{ ssr?, loader? }` per route with `SsrMode = "full" | "data-only" | "client-only"`, the `true`/`false` boolean aliases, and a function form `(state) => SsrMode` resolving per-navigation. The `ssr-mixed/` example demonstrates all four shapes on one server with `getSsrDataMode(state)` branching `entry-server.ts` between `render(App, { props: { router } })` and shell HTML. `svelte-spa-router` is CSR-only and has no SSR-pipeline concept at all — there is no equivalent.

## Where svelte-spa-router wins

- **Smallest possible setup for a CSR-only hash-routed app.** One import, one `<Router {routes}/>` component, no plugins to assemble. Real-Router on Svelte ships three dogfooded examples and a plugin layer for the same overall job — that is by-design (it covers more), but for a 5-page hash-routed SPA, `svelte-spa-router` is denser.
- **Hash routing is default and only mode.** No history-API config, no server fallback rewrites, no `<base href>` ceremony. Real-Router supports hash routing via `@real-router/hash-plugin` (separate package) — equivalent capability, more setup.
- **Built-in scroll restoration.** `restoreScrollState={true}` prop on `<Router>` is a one-line opt-in. Real-Router's equivalent lives in a separate composition pattern.
- **Smaller byte budget.** `svelte-spa-router` is one of the smallest SPA routers in any ecosystem — verifiable on bundlephobia.
- **Non-SvelteKit deployment story.** Hash routing means the deployment can be a single `index.html` on any static host (S3, GitHub Pages) without rewrite rules. Real-Router's history-mode SSR/SSG examples assume Express or a Web Fetch host; an equivalent CSR-only hash deployment requires composing `@real-router/hash-plugin`.
- **Regex routes via `Map`.** Path patterns can be raw `RegExp` with named capture groups — useful for legacy URL shapes. Real-Router's path matcher handles structured patterns; raw regex requires a custom matcher.

## Where they tie

- **Same Svelte 5 framework floor.** Both inherit Svelte 5 stable's lack of chunked HTTP streaming, atomic `hydrate()`, and the component-side reactive model. Neither router can compensate for these at its layer.
- **Same component model.** Both render Svelte 5 components; both work with `use:` actions, `<svelte:head>`, `<svelte:boundary>`.
- **No ISR.** Neither implements on-demand revalidation; in Real-Router it would be deployment-side, in `svelte-spa-router` it is out of scope by design.
- **Config-based routing.** Both define routes as a config (object/Map for `svelte-spa-router`, route tree for Real-Router) rather than file-based. File-based routing in the Svelte ecosystem lives in SvelteKit (excluded as meta-framework).

## Sources

- Real-Router: [`examples/web/svelte/ssr-examples/README.md`](./README.md). Per-example READMEs in [`ssr/`](./ssr/), [`ssr-streaming/`](./ssr-streaming/), [`ssg/`](./ssg/) are the upstream sources for that synthesis.
- `svelte-spa-router`:
  - https://github.com/italypaleale/svelte-spa-router — repo, `Summary` line confirming "without server-side rendering" as design intent
  - https://github.com/italypaleale/svelte-spa-router/blob/main/Advanced%20Usage.md — Nested Routers, Map / regex routes, named/optional/wildcard params
  - retrieved via Context7 `/italypaleale/svelte-spa-router` on **2026-05-06**.
- Choice of competitor: `svelte-spa-router` is the most-known standalone Svelte router with documentation. It is **not an SSR competitor** — it explicitly does not address SSR — and is included only because the prompt's competitor table calls for "the routing-only surface" comparison when no honest standalone SSR competitor exists. SvelteKit is the realistic functional counterpart for SSR/SSG in the Svelte ecosystem and is excluded as a meta-framework. Other standalone Svelte routers (`svelte5-router`, `svelte-mini-router`, `keenmate/svelte-spa-router`) are also CSR-only and do not change this analysis.
