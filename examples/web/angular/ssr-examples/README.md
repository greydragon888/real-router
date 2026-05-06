# Angular SSR Examples

> Server-rendering with Real-Router and Angular 21 across three delivery models — classical SSR with `AngularNodeAppEngine`, lazy-hydration "streaming" via `@defer`, and static site generation via in-process SSR.

Three standalone Angular 21 apps. Each one is a real, e2e-tested dogfooding consumer of `@real-router/*` for a specific server-rendering shape; this document is the synthesis of what the router can and cannot do on Angular, sourced exclusively from the three child READMEs.

> **Terminology note up front.** `ssr-streaming/` here is **client-side incremental hydration**, not HTTP progressive flush. `AngularNodeAppEngine` does set `Transfer-Encoding: chunked` (HTTP/1.1 default for unknown-length bodies), but the body is rendered fully before any byte goes out — empirically the entire HTML lands in **one TCP frame, ~0 ms span** (the child README ships a `node:http` reproducer). The streaming win is per-`@defer` block lazy-loading + selective hydration on the client, not server tree streaming. Distinct from React 19 / Solid (true OOO HTTP flush) and from Svelte 5 (no chunked HTTP either, but no per-block selective hydration either).

| Subdir | Demonstrates |
|---|---|
| [`ssr/`](./ssr) | Classical per-request SSR via `provideRealRouterFactory({ baseRouter, plugins, deps })` + Angular's `REQUEST` token + `cloneRouter`. `@angular/ssr` modern API (`AngularNodeAppEngine.handle(req)` returning Web `Response`; **not** deprecated `CommonEngine`). `provideZonelessChangeDetection()` (Angular 21 zoneless mode). Auth + role gates via `canActivate` + DI; **two complementary HTTP-status strategies** — declarative `ServerRoute` config (URL-based: `path: "gone"`, `status: 410`) and typed loader errors mapped in middleware (data-based: `LoaderRedirect`/`LoaderNotFound`/`LoaderTimeout` → 301/302/404/504). Mixed `RenderMode` (`Server` default / `Client` for marketing). Production HTTP: sha256 strong **ETag** (response buffered via `arrayBuffer()` for hashing), per-route `Cache-Control`, `AbortController` threaded into loader DI. |
| [`ssr-streaming/`](./ssr-streaming) | Per-`@defer` block lazy hydration + `withIncrementalHydration()` + `withEventReplay()` (Angular 21 stable). **7 `@defer` triggers** demonstrated — `(on viewport)`, `(on hover)`, `(on idle; prefetch on viewport; hydrate on idle)` (decoupled triggers), `(on interaction)`, `(when signal())` (predicate-driven, **one-shot**), `(on timer(1500ms))`, `(on immediate)`. `@placeholder` / `@loading` / `@error` secondary blocks. `withEventReplay()` captures clicks issued before a block hydrates and replays them after takeover (verified by 1.2 s artificial chunk delay). `<route-view>` and per-request `cloneRouter()` reuse the same factory as `ssr/`. |
| [`ssg/`](./ssg) | Build-time pre-rendering via **in-process SSR**: `scripts/ssg-build.ts` boots the compiled `server.mjs` on a build-only port (4174), `fetch`-es each URL through the live `AngularNodeAppEngine`, persists static HTML, then `process.exit(0)`. `getStaticPaths(router, entries)` leaf-only enumeration; 8 paths total (1 home + 1 list + 3 profiles + 3 posts). 9-tag meta block (title, description, canonical, og:type, og:title, og:description, og:url, og:image, twitter:card); profile pages use `og:type=profile`, posts use `article`. `404.html` + `sitemap.xml` + filesystem-layout assertions. **`renderApplication` direct is not viable** here (NG0201 — `platformProviders` REQUEST does not propagate into `provideRealRouterFactory`'s injector). Fail-fast guard (`process.exit(1)` on any URL error) is wired but dormant — Angular SSG loaders return `user: undefined` for unknown ids (tolerant), matching Solid/Svelte SSG; opting into the strict `LoaderNotFound` path is a one-file change. |

## Capabilities

What Real-Router actually delivers on Angular 21 across these three shapes, grouped by concern. Each item is sourced from one or more child READMEs.

**Per-request isolation via `provideRealRouterFactory`.** `provideRealRouter(router)` would leak state between concurrent users (single shared instance); `provideRealRouterFactory({ baseRouter, plugins, deps })` uses `useFactory`: reads `inject(REQUEST, { optional: true })`, calls `cloneRouter(baseRouter, deps?.(request))` for a request-scoped clone, applies plugins (function form differentiates client vs server registration), kicks off async start via `provideAppInitializer(async () => router.start(...))`, and disposes the clone via `DestroyRef.onDestroy(() => router.dispose())` when Angular tears the application Injector down at end of request.

**Conditional plugin registration.** The `plugins` function form in `provideRealRouterFactory` lets the same factory branch by environment: server registers `ssrDataPluginFactory(loaders)` only; client registers `browserPluginFactory()` + `ssrDataPluginFactory(loaders)`. `REQUEST` is `null` on the client — that's the seam.

**Single data-loading plugin shape, with tolerant SSG.** `@real-router/ssr-data-plugin` writes plain JSON-shaped data into `state.context.data` for all three pipelines, with the typed-errors subpath (`@real-router/ssr-data-plugin/errors`) — `LoaderNotFound`/`LoaderRedirect`/`LoaderTimeout` + `withTimeout`. **Note:** Angular SSG loaders deliberately do **not** opt into the typed-error path (return `user: undefined` for unknown ids; pages render the "User not found" branch) — same divergence as Solid/Svelte SSG, distinct from Vue/React SSG which throw. The fail-fast guard in `ssg-build.ts` (`process.exit(1)` on any throw) is wired but dormant. The `ssr/` and `ssr-streaming/` examples do use typed errors via Express middleware.

**No `__SSR_STATE__` serialisation — loader runs twice.** All three Angular examples explicitly document this: the same `ssr-data-plugin` is registered on both server and client, so `start(url)` runs once during SSR (populates `state.context.data`, HTML rendered) and again during client hydration after JS bootstraps (`state.context.data` re-populated). For in-memory data the second run is invisible; for real `fetch()` it is one extra round-trip per route on first paint.

The post-hydration loader-skip mechanism (#596) **does not apply here** — `provideRealRouterFactory` calls `router.start(path)` directly from `provideAppInitializer`, not via `hydrateRouter()`, so the `RouterInternals.hydrationState` scratchpad never gets populated. See child [`ssr/README.md`](./ssr) → "Why doesn't #596 help here?" for the full explanation and a `TransferState` bridge mitigation sketch. Other mitigations are application-level work (serialize via `serializeRouterState`, layered cache in the loader closure, or `lifecycle-plugin onNavigate`); the plugin's contract is "intercept `start()`" — what `start()` does on the client is policy.

**Two complementary HTTP-status strategies (`ssr/`).** Declarative `ServerRoute` config pins status + headers to a path pattern (Strategy A — URL-based: `{ path: "gone", status: 410, headers: { Sunset, Deprecation, Link } }`) — the SSR renderer still runs (rich body), but status and headers are pinned at routing time. Typed loader errors caught by Express middleware map to HTTP responses (Strategy B — data-based): `CANNOT_ACTIVATE` → 302, `LOADER_REDIRECT` → 301/302, `LOADER_NOT_FOUND` → 404 text/plain, `LOADER_TIMEOUT` → 504 text/plain. Both verified side-by-side in one e2e test.

**Mixed `RenderMode` per path (`ssr/`).** `app.routes.server.ts` declares per-path render strategies: `RenderMode.Server` (default — fresh per-request, REQUEST DI honored, loaders run), `RenderMode.Client` (same prebuilt CSR shell for every visitor, no per-request work). E2e proves: `/live` (Server) yields different `datetime=` timestamps across requests, `/marketing` (Client) yields **bytewise identical** responses with marketing content materialising only after JS bootstrap. **`RenderMode.Prerender` is not supported** with `provideRealRouterFactory` — see Limitations.

**`@defer` triggers as the streaming-equivalent (`ssr-streaming/`).** Angular 21's `@defer` blocks are the per-component lazy-loading mechanism that `withIncrementalHydration()` upgrades into per-block selective hydration. The trigger taxonomy demonstrated:

| Trigger | Use case |
|---|---|
| `(on viewport; hydrate on viewport)` | Below-the-fold content. |
| `(on idle; prefetch on viewport; hydrate on idle)` | Decoupled triggers — chunk download eager, JS execution lazy. |
| `(on interaction; hydrate on interaction)` | Content unlikely to be read on every visit. |
| `(when signal(); hydrate when signal())` | Predicate-driven. **One-shot** — once activated, stays mounted. |
| `(on timer(1500ms); hydrate on timer(1500ms))` | Time-delayed appearance. |
| `(on immediate; hydrate on immediate)` | Code-split chunk boundary, no lazy trigger. |
| `(on hover; hydrate on hover)` | Content user might browse but doesn't always need. |

Plus `@placeholder` / `@loading` (after Xms; minimum Yms) / `@error` secondary blocks. `hydrate on <trigger>` syntax is required for `withIncrementalHydration()` to take ownership during hydration — without it, the block only lazy-loads.

**`provideClientHydration(withIncrementalHydration(), withEventReplay())`.** Per-`@defer` block hydration **plus** event replay — clicks/keydowns issued before a block hydrates are captured globally and replayed once the component takes over. Verified end-to-end by an e2e test that artificially delays the Reviews chunk by 1.2 s, clicks "Mark all read" while it's en route, and asserts `data-marked="true"` after hydration.

**Build-time path enumeration (`ssg/`).** `getStaticPaths(router)` returns **leaf** paths only; `ssg-build.ts` derives intermediate parent URLs from leaves (e.g. `/users/:id` from `/users/:id/posts`) and adds the `/users` list page manually. Result: 8 pre-rendered URLs.

**In-process SSR for SSG.** Instead of `@angular/platform-server.renderApplication` direct (which produces NG0201 — `platformProviders` REQUEST does not propagate into `provideRealRouterFactory`'s injector), `ssg-build.ts` boots the compiled `server.mjs` on a build-only port and `fetch`-es each URL through the live `AngularNodeAppEngine`. This guarantees the SSG output is **byte-identical** to what the runtime SSR server would produce — same render pipeline.

**Per-route HTTP semantics, per pipeline.**

| Pipeline | `Cache-Control` | `ETag` | `AbortController` |
|---|---|---|---|
| `ssr/` (`AngularNodeAppEngine` + buffered) | per-route, `must-revalidate` | strong sha256 (response buffered via `arrayBuffer()` for hashing) | per-request, attached to `req.abortSignal`; loader pulls via `getDep("abortSignal")` (forwarded through `provideRealRouterFactory` `deps`) |
| `ssr-streaming/` | out of scope by example design | not asserted | not asserted |
| `ssg/` (sirv preview) | none (sirv default) | not asserted | not applicable |

The `ssr-streaming/` envelope is intentionally narrow — Scenario 12 deliberately does **not** assert `Transfer-Encoding: chunked` because Node HTTP runtimes / proxy chains can switch between chunked and `Content-Length` for the same body, making the assertion environment-dependent.

**Mandatory Angular-side wiring.** All three examples require the same baseline:

- `provideRouter([NgRouterStub])` peer — `@angular/ssr` rejects bootstraps without `provideRouter(...)`. `NgRouterStub` is a no-op standalone Component routed under `path: "**"` so all routing decisions fall through to Real-Router's `<route-view>`. SSR-pipeline placeholder, never visible.
- `provideServerRendering(withRoutes(serverRoutes), withAppShell(AppComponent))` — `withAppShell` is required; without it `AngularNodeAppEngine` cannot serialise the component tree.
- `security.allowedHosts: ["localhost"]` in `angular.json` — Angular 21 SSR rejects unrecognized hosts by default (SSRF prevention). Without it the server returns 403 for every request — and for SSG this is build-blocking, since `ssg-build.ts` itself depends on the `localhost:4174` loopback.
- `server-runner.mjs` Node wrapper — the compiled `server.mjs`'s `isMainModule(import.meta.url)` check is fragile across `@angular/ssr` versions; the wrapper imports `app.handle` and binds it to Node's request/response stream as a stable workaround. Used by `ssr/` and `ssr-streaming/`; SSG only invokes the server in-process.
- `outputMode: "server"` + `ssr.entry` — required even for SSG (which doesn't run a runtime server). The placeholder `src/server.ts` satisfies the build invariant; sirv serves the static output at runtime.

## Limitations

Each item is categorised: **(framework-side)** — Angular 21 / `@angular/ssr` / build-pipeline constraint not under Real-Router's control; **(design choice)** — deliberate Real-Router (or plugin) omission with documented rationale, often closeable by user-side composition; **(example design choice)** — per-example scope narrowing or simplification, not a library/adapter constraint; **(out of scope)** / **(deployment-side)** — beyond Real-Router's library scope (runtime-only features, host web-server config).

- **(framework-side) Angular SSR streaming is NOT HTTP progressive flush.** Body fully rendered before first byte goes out: 1 TCP frame, ~0 ms span. `Transfer-Encoding: chunked` is HTTP/1.1 default framing for unknown-length bodies, not OOO streaming. The streaming win is per-`@defer` block lazy hydration on the client, not server tree streaming.
- **(framework-side) No out-of-order placeholders in the shell.** `@placeholder` blocks render into the same single HTML document — `@defer` is a *client-side* trigger boundary, not a server-side stream marker. Distinct from React 19's `<!--$?-->` mechanism.
- **(framework-side) `RenderMode.Prerender` is not supported with `provideRealRouterFactory`.** Angular 21's `Prerender` pipeline bootstraps via `renderApplication` without supplying the `REQUEST` token. The factory's `useFactory` therefore sees `request === null` and `deriveStartPath()` falls back to `"/"` — every prerendered URL would resolve to the home route. Build-time pre-rendering must use the in-process SSR pipeline shown in `ssg/` (boot `server.mjs` on a private port, `fetch` each URL through the live `AngularNodeAppEngine`). Tracked alongside #582 — once `@angular/ssr` exposes the prerender URL through the application Injector, this constraint goes away.
- **(framework-side) `(on never)` `@defer` trigger is rejected by the Angular 21.2 compiler** (`NG5002: Unrecognized trigger type "never"`). Angular's roadmap mentions it; not yet shipped.
- **(framework-side) `@defer (when signal())` is one-shot.** Once activated, the component stays mounted even if the predicate flips back to false. Use a regular `@if` for reactive show/hide.
- **(framework-side) `withTimeout()` does not cancel underlying loader work.** Races a `LoaderTimeout` against the original promise; the slow loader keeps running. Pair with `AbortController` (the `slow` loader in `ssr/` does both).
- **(framework-side) `404`/`504` response bodies are plain text, not SSR-rendered NotFound pages.** Rendering a rich 404 via Strategy B would require a second `angularApp.handle()` pass against a `/__not-found` URL — kept simple in the demo. Strategy A (declarative `ServerRoute` status override) does ship a rich SSR body, but is limited to statuses knowable at routing time.
- **(framework-side) Required ceremonial wiring.** `provideRouter([NgRouterStub])` peer + `withAppShell(AppComponent)` + `security.allowedHosts: ["localhost"]` + `server-runner.mjs` Node wrapper + `outputMode: "server"`. None are Real-Router design choices; all are Angular/`@angular/ssr`-side requirements documented as load-bearing in the child READMEs.
- **(design choice) No `<Suspense>` / `defer()` wrapper API.** Angular 21's `@defer` blocks already provide the same ergonomics with native compiler support.
- **(design choice) No router-specific streaming API.** Streaming behaviour comes from `AngularNodeAppEngine` + `@defer` + `withIncrementalHydration()` + `withEventReplay()`; the router's role is identical to non-streaming SSR.
- **(design choice) `ssr-data-plugin` (boot-path) and `lifecycle-plugin onNavigate` (CSR navigation) split the lifecycle by phase, on purpose.** `ssr-data-plugin` intercepts `router.start()` — runs once during SSR; on the client `start(url)` runs again during hydration in the Angular examples (see the framework-side note below — the post-hydration scratchpad mechanism #596 is bypassed by `provideRealRouterFactory`). CSR navigations via `realLink` do NOT re-run its loader; that is `lifecycle-plugin.onNavigate`'s job — explicitly documented as the canonical client-side path in the Angular child READMEs. Single-responsibility per plugin keeps SSG-only build scripts and pure-CSR SPAs from carrying interception code they don't use.
- **(framework-side) `ssr-data-plugin` re-runs the loader on the post-hydration `start()` in the Angular examples.** Other adapters (react / preact / vue / solid / svelte) skip the post-hydration loader call automatically via the `RouterInternals.hydrationState` scratchpad populated by `hydrateRouter()` (#596). Angular's `provideRealRouterFactory` bypasses `hydrateRouter()` entirely — it calls `router.start(path)` directly from `provideAppInitializer` — so the scratchpad never gets populated and the plugin runs the loader as today. The Angular examples additionally choose not to ship an `__SSR_STATE__` blob, doubling down on the simplicity. Bridging Angular's `TransferState` API into the scratchpad would close the gap; sketch lives in [`ssr/README.md`](./ssr) → "Why doesn't #596 help here?". Invisible for in-memory data; one extra round-trip per route for real `fetch()`.
- **(out of scope) SSG is not ISR.** Real-Router's SSG is a build-time generator (`getStaticPaths` → render → write static HTML). Incremental Static Regeneration is a runtime feature (cache + on-demand revalidation), inherently outside the scope of a build-time tool. To update a page, rebuild and redeploy. ISR equivalents live in framework-bundled solutions (Next.js, Astro), not in standalone routers.
- **(deployment-side) SSG `404.html` SEO status depends on the host web server.** sirv preview returns 404 for unknown URLs but does NOT automatically serve `404.html` with HTTP 404 status. Real production needs nginx `try_files`, Cloudflare Pages `_redirects`, Netlify `_redirects`, etc. Static-file SSG always defers this to the host config — true for Vue/React/Solid/Svelte siblings as well.

### Why no `ssr-rsc/`?

Angular does not implement React Server Components. The `ssr-streaming/README.md` comparison table characterises Angular 21's network model as "lazy hydration only (HTTP body arrives at once)" — no Flight wire format, no out-of-order shell, no progressive HTTP flush. Per-`@defer` block selective hydration is the closest Angular equivalent to React 19's selective hydration, but it operates on client-side trigger boundaries, not on a server-streamed component tree. If you need RSC, use the React adapter — see [`../../react/ssr-examples/ssr-rsc/`](../../react/ssr-examples/ssr-rsc).

## Angular-unique aspects

What's specific to the Angular adapter, expressed as Real-Router integration points rather than Angular theory:

- **Real-Router integrates with a non-Vite SSR pipeline.** Angular uses `@angular/build` (the standard Angular CLI 21 application builder), not Vite directly — and `@angular/ssr`'s modern `AngularNodeAppEngine.handle(req)` API instead of `renderToString`-shaped renderers. The `provideRealRouterFactory` factory ties Real-Router into Angular's per-request DI scope (via the `REQUEST` token) without owning the render pipeline at all. This is the only adapter in the monorepo whose dogfooding examples don't use Vite for the SSR build.
- **Per-`@defer` block selective hydration is the closest Angular equivalent to React/Solid selective hydration.** It operates per-component (`@defer` block boundary) rather than per-Suspense boundary, and each `@defer` ships its own JS chunk loaded on demand. `withEventReplay()` covers the gap between the user clicking a placeholder and the chunk hydrating — a closer fit to React 19's behaviour than Vue 3.5 lazy hydration (which is opt-in per async component with no event replay).
- **In-process SSR for SSG is the Angular-specific build pattern.** `renderApplication` direct is unviable with `provideRealRouterFactory` (NG0201). Booting the compiled `server.mjs` on a private port and `fetch`-ing each URL guarantees byte-identical output to runtime SSR — at the cost of needing `outputMode: "server"` + `ssr.entry` even for builds that ship only static files. The trade-off is documented as deliberate.

## Empirical findings

Findings that the three READMEs flag as non-obvious, empirically-verified, or footgun-class — distilled here so adapter-shopping readers don't have to re-discover them.

1. **Angular 21 SSR streaming is, empirically, NOT progressive HTTP flush — verified via `node:http` reproducer.** Body delivered in 1 TCP frame, ~0 ms span. The `ssr-streaming/README.md` ships an inline reproducer (`node --input-type=module -e '...'`) so the wire-format claim is falsifiable. Distinct from React 19 / Solid (multiple frames spanning the slowest async delay) and aligned with Svelte's deferred-data SSR — except Angular adds per-`@defer` selective hydration on top, which Svelte does not.

2. **Chunked transfer assertion is environment-dependent — the e2e suite deliberately avoids it.** Different Node HTTP runtimes / proxy chains switch between chunked and `Content-Length` for the same body. Scenario 12 asserts headers (`text/html; charset=utf-8`, no `x-powered-by`, status 200) but skips `Transfer-Encoding`. Use the `node:http` snippet to reproduce wire-format behaviour outside Playwright.

3. **`RenderMode.Prerender` does NOT work with `provideRealRouterFactory`** — `REQUEST` is null in the prerender pipeline, every URL falls back to `"/"`. The documented workaround is the in-process SSR pipeline in `ssg/` (boot `server.mjs`, `fetch` each URL through the live `AngularNodeAppEngine`). Tracked against future `@angular/ssr` evolution that would expose the prerender URL through the application Injector.

4. **`renderApplication` direct produces NG0201** with this setup — `platformProviders` REQUEST does not propagate cleanly into `provideRealRouterFactory`'s injector. The in-process SSR pipeline sidesteps this by reusing the exact same render pipeline as runtime SSR (`AngularNodeAppEngine.handle(req)` knows how to inject REQUEST into the per-request DI scope).

5. **`security.allowedHosts: ["localhost"]` is more critical for SSG than for runtime SSR.** Without it, the in-process `AngularNodeAppEngine` returns 403 for every `fetch("http://localhost:4174/...")` from the build script — **the entire build fails**. Production deployments don't need to extend the list (SSG output is static), but the build pipeline does.

6. **Fail-fast guard in `ssg/` is wired but dormant under tolerant loaders.** `ssg-build.ts:140-172` collects errors per URL and exits with code 1 on any throw — opposite of skip-and-continue SSG builders. Rationale: a stale `entries.ts` id silently emitting a "user not found" page with HTTP 200 would be worse than a loud build failure. **But:** Angular SSG loaders themselves return `user: undefined` for unknown ids (no throw), so the guard never fires under the current example design. Opting into the strict `LoaderNotFound` path activates it — see Solid/Svelte siblings for the same divergence, Vue/React for the strict counterpart.

7. **`withEventReplay()` survives slow hydration (Scenario 18).** Reviews chunk artificially delayed by 1.2 s; click on "Mark all read" issued during the delay is captured globally and replayed once the component hydrates. `data-marked="true"` after hydration is the assertion. Without `withEventReplay()`, the click would be silently dropped.

8. **`@defer (when signal())` is one-shot — predicate-flip-back does NOT unmount.** Once activated, the component stays mounted even if the signal flips back to false. Verified end-to-end: placeholder visible → toggle → component visible → toggle back → component **stays**. Use `@if` for reactive show/hide.

## See Also

- [`@real-router/angular`](../../../../packages/angular) — adapter package (`provideRealRouterFactory`, `injectRoute`, `<route-view>`, `<a realLink>`)
- [`@real-router/ssr-data-plugin`](../../../../packages/ssr-data-plugin) — JSON-shaped per-route data loading (used by all three pipelines; `ssr/` and `ssr-streaming/` use typed errors, `ssg/` is tolerant — fail-fast guard wired but dormant)
- [`@real-router/ssr-data-plugin/errors`](../../../../packages/ssr-data-plugin/src/errors.ts) — typed loader errors (`LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, `withTimeout`)
- [`@real-router/browser-plugin`](../../../../packages/browser-plugin) — client-side URL sync after hydration
- [Angular Integration wiki](https://github.com/greydragon888/real-router/wiki/Angular-Integration#server-side-rendering) — adapter-level documentation
- [React SSR examples](../../react/ssr-examples) — counterpart with true OOO HTTP streaming + RSC
- [Solid SSR examples](../../solid/ssr-examples) — counterpart with true OOO HTTP streaming + selective hydration
- [Vue SSR examples](../../vue/ssr-examples) — counterpart with chunked HTTP + blocking Suspense
- [Svelte SSR examples](../../svelte/ssr-examples) — counterpart with deferred-data SSR (no chunked HTTP, no selective hydration)
- Angular docs: [Deferrable views (`@defer`)](https://angular.dev/guide/templates/defer), [Incremental hydration](https://angular.dev/guide/hydration#incremental-hydration), [`@angular/ssr`](https://angular.dev/guide/ssr), [`provideClientHydration`](https://angular.dev/api/platform-browser/provideClientHydration), [`provideZonelessChangeDetection`](https://angular.dev/api/core/provideZonelessChangeDetection)
