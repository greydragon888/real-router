# SSR Angular Example

Server-side rendering with Real-Router, Angular 21, `@angular/ssr` (`AngularNodeAppEngine`), and Express — the Angular port of the React/Vue/Solid/Svelte `ssr/` examples.

## What This Demonstrates

- **`provideRealRouterFactory({ baseRouter, plugins, deps })`** — per-request router scope via Angular's `REQUEST: InjectionToken<Request | null>`. Each request gets an isolated router clone via `cloneRouter(baseRouter, deps?.(request))`, started by `provideAppInitializer`, disposed via `DestroyRef.onDestroy`.
- **Conditional `plugins` function form** — `browser-plugin` registered only on the client; the server registers `ssrDataPluginFactory(loaders)` only.
- **Per-request DI deps** — `currentUser` derived from `request.headers.get("cookie")` on the server, from `document.cookie` on the client (after hydration).
- **`@angular/ssr` modern API** — `AngularNodeAppEngine.handle(req)` returns a Web `Response`. `server.ts` buffers the body via `await response.arrayBuffer()` and writes it to the Node `res` with `res.end(buffer)`. Buffering (rather than `writeResponseToNodeResponse` streaming) is required so the response body can be hashed for the strong `ETag` header. NOT the deprecated `CommonEngine`.
- **`provideZonelessChangeDetection()`** — full Angular 21 zoneless mode; signals + `computed` drive change detection without `zone.js`. E2e (`ssr.spec.ts:60-66` "zoneless proof") asserts no `zone.js` artefacts in the SSR HTML.
- **`provideServerRendering(withRoutes(serverRoutes), withAppShell(AppComponent))`** — server-side bootstrap. `withAppShell` registers `AppComponent` as the SSR root; without it `AngularNodeAppEngine` cannot serialize the component tree.
- **`@angular/router` + `NgRouterStub`** — required peer for `@angular/ssr`'s URL matching (`@angular/ssr` rejects bootstraps without `provideRouter(...)`). `NgRouterStub` is a no-op standalone Component routed under `path: "**"` so all routing decisions fall through to Real-Router's `<route-view>`. SSR-pipeline placeholder, never visible. Without this paragraph readers see "two routers in deps" and assume conflict.
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route loaders run during `router.start(url)` and write to `state.context.data`. Components read it via `injectRoute()` signal.
- **Cookie-based auth-gated routes** — `dashboard` and `admin` protected by `canActivate` guards consuming `getDep("currentUser")`.
- **Query params + nested loaders** — `?sort` on `/users`, leaf-route loader for `/users/:id/posts` returns combined parent + child data.
- **Loader error → 500 page** — rejected loader in `provideAppInitializer` propagates → `bootstrapApplication` rejects → server returns 500. See [`.claude/rfc-angular-ssr-factory-ru.md`](../../../../../.claude/rfc-angular-ssr-factory-ru.md) for the full design rationale.
- **Loader-driven HTTP semantics** — typed loader errors (`LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout` from `@real-router/ssr-data-plugin/errors`) are caught by the express middleware and mapped to `301/302`, `404`, and `504` responses respectively. The plugin stays HTTP-agnostic; the application owns the bridge.
  - `users.profile` throws `LoaderNotFound` for ids that don't exist → server returns 404 (vs `UNKNOWN_ROUTE` which is a 200 + NotFound page via `allowNotFound: true`).
  - `users.profile.posts` does the same — leaf loader re-validates the parent user id, so `/users/9999/posts` also surfaces as 404 (verified by `e2e/ssr.spec.ts:474-480`).
  - `legacyUser` (`/legacy-user/:id`) throws `LoaderRedirect("/users/:id", 301)` — demonstrates the canonical-URL pattern (Next.js-style `redirect()` from a loader).
  - `slow` (`/slow`) demonstrates `withTimeout()` — the loader sleeps 5 s but is wrapped in a 250 ms budget, so the server responds 504 Gateway Timeout instead of hanging an SSR worker.
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation through `realLink` directive.
- **Incremental hydration + event replay** — `provideClientHydration(withIncrementalHydration(), withEventReplay())`. Event replay captures clicks/keydowns issued before a block hydrates and replays them once the component takes over. Critical for streaming SSR UX where the user can interact with placeholders before their JS arrives.
- **Mixed `RenderMode`** — `app.routes.server.ts` maps `/marketing` to `RenderMode.Client` (CSR shell, identical bytes for every visitor, content materialises after JS bootstrap) and `/live` to `RenderMode.Server` (fresh per-request render with timestamp proof). All other paths default to `RenderMode.Server`. See "Mixed RenderMode" section below for the trade-offs and the unsupported `RenderMode.Prerender` known limitation.

## Architecture

```
src/
  _auth.ts               Cookie parsing → currentUser DI (works server + client)
  _known-users.ts        KNOWN_USERS table + parseCookieHeader + lookupUserFromCookies
  database.ts            In-memory mock store
  app.config.ts          Shared providers — provideZonelessChangeDetection,
                         provideRouter([NgRouterStub]) (peer required by @angular/ssr),
                         provideRealRouterFactory({ baseRouter, plugins, deps })
  app.config.server.ts   Server-only — provideServerRendering(withRoutes(serverRoutes),
                         withAppShell(AppComponent))
  app.routes.server.ts   ServerRoute[] — Mixed RenderMode: /marketing → Client,
                         /live → Server, /gone → Server with status:410 + Sunset/
                         Deprecation/Link headers, ** → Server (default)
  app.component.ts       Root standalone component — <route-view> + <ng-template routeMatch>
  main.ts                Client entry — bootstrapApplication + provideClientHydration(
                         withIncrementalHydration(), withEventReplay())
  main.server.ts         Server bootstrap — accepts BootstrapContext, returns bootstrapApplication
  server.ts              Express + AngularNodeAppEngine; maps CANNOT_ACTIVATE → 302,
                         LOADER_REDIRECT → 301/302, LOADER_NOT_FOUND → 404 text/plain,
                         LOADER_TIMEOUT → 504 text/plain; buffers Web Response via
                         arrayBuffer() for sha256 ETag; per-request AbortController
                         attached to req.abortSignal
  router/
    createBaseRouter.ts  createRouter(routes, options) — base for cloneRouter per request
    routes.ts            Route definitions with auth guards (incl. legacyUser, slow)
    loaders.ts           Per-route data loaders (incl. NotFound + Redirect + withTimeout demos);
                         imports typed errors from @real-router/ssr-data-plugin/errors
    cache-policies.ts    Per-URL Cache-Control mapping
  pages/
    home, users-list, user-profile, user-posts, dashboard, admin,
    not-found, gone, live, marketing (.component.ts)

server-runner.mjs        Node.js wrapper — imports `app` from compiled server.mjs and calls listen.
                         The compiled server.mjs's isMainModule check is fragile across
                         @angular/ssr versions; the wrapper sidesteps that by binding
                         app.handle to req/res directly.
```

## SSR Flow

```
Server (per request, via AngularNodeAppEngine):
  REQUEST token populated by @angular/ssr runtime
    → provideRealRouterFactory's useFactory provider:
        cloneRouter(baseRouter, deps(request))      # currentUser from cookies
        usePlugin(ssrDataPluginFactory(loaders))    # NO browser-plugin on server
        DestroyRef.onDestroy(router.dispose)        # cleanup after response
    → provideAppInitializer:
        await router.start(request.url)             # loaders run, state.context.data populated
    → AppComponent renders
        <route-view> reads route.routeState() signal
        Pages read state.context.data via injectRoute()
    → AngularNodeAppEngine.handle(req) returns Web Response
    → writeResponseToNodeResponse pipes to Node res
    → Application Injector destroyed → router disposed

Client (once, after hydration):
  bootstrapApplication(AppComponent, { ...appConfig, providers: [...,
    provideClientHydration(withIncrementalHydration())] })
    → REQUEST is null on client
    → provideRealRouterFactory's useFactory:
        cloneRouter(baseRouter, deps(null))         # currentUser from document.cookie
        usePlugin(browserPluginFactory(), ssrDataPluginFactory(loaders))
    → provideAppInitializer:
        await router.start(window.location.pathname + search)
        # browser-plugin's start interceptor wraps with location-derived path.
        # ssr-data-plugin runs the loader AGAIN on the client — no SSR-state
        # blob is shipped, and provideRealRouterFactory bypasses hydrateRouter()
        # so the post-hydration scratchpad (#596) is never populated.
        # See "No SSR-State Serialization" below for the full explanation.
    → Angular claims server-rendered DOM (no flash, no mismatch)
```

## No SSR-State Serialization (loader runs twice)

This example does **not** ship a `window.__SSR_STATE__` blob. The same `ssr-data-plugin` is registered on both the server and the client (see `app.config.ts`), so:

1. Server `start(url)` → loader runs → `state.context.data` populated → HTML rendered
2. Client `start(url)` after hydration → loader runs **again** → `state.context.data` re-populated

For the in-memory database in this demo it is invisible. **In a real app it is a second network roundtrip per route on first paint.**

### Why doesn't `#596` help here?

The post-hydration loader-skip optimization (#596) hooks into `hydrateRouter()`, which deposits the parsed `__SSR_STATE__` into a one-shot scratchpad on `RouterInternals.hydrationState` before delegating to `router.start()`. `ssr-data-plugin`'s start interceptor reads the scratchpad and reuses the server-resolved `state.context.data` instead of re-running the loader.

Angular's `provideRealRouterFactory` (used in this example) **bypasses** `hydrateRouter()` entirely — it calls `router.start(path)` directly from `provideAppInitializer`, with the URL derived from `REQUEST` (server) or `window.location` (client). The scratchpad is never populated, so the plugin runs the loader as today.

### Mitigations the example does not show

- **Bridge `__SSR_STATE__` through Angular `TransferState`.** Serialize `state.context.data` server-side via `serializeRouterState()`, store it in `TransferState`, and on the client write into `getInternals(router).hydrationState` from a `provideEnvironmentInitializer` that runs **before** `provideAppInitializer` triggers `start()`. The plugin's interceptor would then pick it up and skip the loader.
- **Cache loader results inside the loader closure** (per-request cache hits the second invocation).
- **Use `@real-router/lifecycle-plugin` `onNavigate`** for client-side fetching with explicit cache control.

The double-run is a deliberate simplification, not a router limitation. The plugin's contract is "intercept `start()`"; what `start()` does on the client is application-level policy. Wiring the `TransferState` ↔ `hydrationState` bridge for Angular SSR deserves its own helper and is outside the scope of this example.

## SSR-Only Plugin Contract

The `@real-router/ssr-data-plugin` intercepts `router.start()`, **not** `router.navigate()`. After hydration, subsequent CSR navigations via `realLink` do NOT re-run loaders — `state.context.data` becomes `undefined` for the target route. This matches the Vue/Solid/Svelte/React `ssr/` examples. Use `lifecycle-plugin`'s `onNavigate` if you need data fetching on every navigation.

The e2e suite verifies this contract with two assertions: (1) the DOM ends up showing the "User not found" branch after a CSR click, and (2) Playwright's `page.on("request")` confirms zero new HTML/document/fetch/xhr requests during the click — the data really did NOT come from a server roundtrip.

## Mixed RenderMode

`app.routes.server.ts` declares per-path render strategies. Order matters — patterns are first-match-wins, so specific paths come before the catch-all:

```ts
export const serverRoutes: ServerRoute[] = [
  { path: "marketing", renderMode: RenderMode.Client },
  { path: "live",      renderMode: RenderMode.Server },
  { path: "**",        renderMode: RenderMode.Server },
];
```

| Mode | What ships from server | Per-request work | Use case |
|------|------------------------|------------------|----------|
| `RenderMode.Server` (default) | Fresh HTML per request, REQUEST DI honored, loaders run | Yes — full bootstrap | Auth-aware pages, cookie-driven content, dynamic data |
| `RenderMode.Client` | The same prebuilt CSR shell (`index.csr.html`) for every Client-mode path | No — static bytes only | Highly interactive pages where SSR adds latency without SEO value (admin, signed-in dashboards) |

Behavior verified by e2e:
- `/live` (Server) — two consecutive `request.get('/live')` produce different `datetime="..."` timestamps. Proves fresh per-request bootstrap.
- `/marketing` (Client) — two consecutive `request.get('/marketing')` produce **bytewise identical** responses, neither contains `data-testid="marketing-page"`. The marketing content materializes only after `page.goto()` lets the JS bundle bootstrap and `router.start("/marketing")` runs client-side.

### `RenderMode.Prerender` is **not** supported here

Angular 21's `Prerender` pipeline bootstraps the app via `renderApplication` without supplying the `REQUEST` token. `provideRealRouterFactory`'s `useFactory` therefore sees `request === null` and `deriveStartPath()` falls back to `"/"` — every prerendered URL would resolve to the home route. Build-time pre-rendering for Real-Router-driven apps must use the in-process SSR pipeline shown in the `ssg/` example (boot `server.mjs` on a private port, `fetch` each URL through the live `AngularNodeAppEngine`, persist the HTML), not `RenderMode.Prerender`. Tracked alongside [#582](https://github.com/greydragon888/real-router/issues/582) — once `@angular/ssr` exposes the prerender URL through the application Injector, this constraint goes away.

## Mapping Loader Errors to HTTP

There are two complementary HTTP-status strategies in this example. Pick based on whether the status depends on URL alone or on resolved data.

### Strategy A — declarative `ServerRoute` config (URL-based status)

`app.routes.server.ts` lets you pin a status code (and headers) to a path pattern:

```ts
{
  path: "gone",
  renderMode: RenderMode.Server,
  status: 410,
  headers: {
    "Sunset": "Wed, 01 Jan 2025 00:00:00 GMT",
    "Deprecation": "true",
    "Link": '</marketing>; rel="successor-version"',
  },
}
```

The SSR renderer still runs (so the body explains the deprecation in human-readable HTML), but the wire-level status and headers are pinned. **Use when the status is a property of the URL itself** — sunset endpoints, intentionally-410 placeholders, retired API redirect pages.

### Strategy B — typed loader errors mapped in middleware (data-based status)

`server.ts` middleware inspects the `code` field of any error thrown out of `bootstrapApplication`:

| Error `code`       | HTTP response                                |
| ------------------ | -------------------------------------------- |
| `CANNOT_ACTIVATE`  | `302 Location: /` (auth guard rejected)      |
| `LOADER_REDIRECT`  | `301/302 Location: error.target`             |
| `LOADER_NOT_FOUND` | `404 Not Found` (text/plain)                 |
| `LOADER_TIMEOUT`   | `504 Gateway Timeout` (text/plain)           |
| anything else      | propagates to express default → `500`        |

**Use when the status depends on resolved data** — `users.profile` loader looks the user up, throws `LoaderNotFound` if missing → 404; legacy URL loader throws `LoaderRedirect("/canonical/...")` → 301 with the canonical Location.

### Side-by-side comparison

The e2e suite verifies both strategies in one test (`serverRoutes status override vs loader-thrown error` in `e2e/ssr.spec.ts`): `/gone` returns `text/html` 410 with sunset headers + a real SSR body, while `/users/9999` returns `text/plain` 404 with a minimal body. Trade-off:

- **Strategy A** ships a richer body (full SSR render through Angular) and integrates with build-time prerendering / CDN cache headers. Limited to status overrides knowable at routing time.
- **Strategy B** carries any data-derived status, but the body in this example is `text/plain "Not Found"` for simplicity. Rendering a rich 404 from middleware would require a second `angularApp.handle()` pass against a `/__not-found` URL with `res.status(404)`.

`withTimeout()` cancellation is cooperative (#598): the loader receives `{ signal }` that aborts *before* the race rejects with `LoaderTimeout`, so loader I/O honoring the signal (`fetch(url, { signal })`, DB drivers, etc.) actually cancels the underlying work. Loaders that don't propagate the signal still run to completion in the background. The `slow` loader composes the deadline with `options.upstreamSignal` (client disconnect from per-request DI) — composed signal aborts on whichever fires first.

## Production HTTP semantics: ETag, Cache-Control, AbortController

`server.ts` adds three production-grade pieces on top of the AngularNodeAppEngine pipeline:

- **Strong `ETag`** — the Web Response from `angularApp.handle(req)` is buffered (`response.arrayBuffer()`), hashed (sha256 → 16 base64url chars), and the hash is set as the `ETag` header. Conditional GET (`If-None-Match`) returns `304 Not Modified` with an empty body. Distinct routes yield distinct ETags; identical routes with deterministic loaders yield the same ETag across requests.
- **Per-route `Cache-Control`** — `src/router/cache-policies.ts` maps URL paths to directives: `/` → `public, max-age=300, s-maxage=3600, must-revalidate`, `/users` → `public, max-age=60, must-revalidate`, `/users/:id` → `public, max-age=120, must-revalidate`, `/dashboard` and `/admin` → `private, no-store`, `/legacy-user/:id` → 1-day cache for the redirect itself, `/slow`/`/boom` → `no-store`.
- **`AbortController` per request** — the controller's signal is attached to the Express request object (`(req as { abortSignal? }).abortSignal = signal`) so the `provideRealRouterFactory({ deps })` factory in `app.config.ts` can forward it into Real-Router's per-request dep map. The `slow` loader pulls it via `getDep("abortSignal")` and forwards it as `withTimeout(..., { upstreamSignal })`; the composed signal aborts on either the 250 ms deadline or `req.on("close")`, and `fetch(..., { signal })` propagates the abort to the network layer (#598). Without this wiring a 5 s upstream `fetch` would hold the worker even after the client gives up. The e2e suite verifies the server releases the handler within 1 s and asserts via `/__bench/abort-count` that the upstream fetch is cancelled at the network layer.

These are demonstrated end-to-end by 4 dedicated tests in `e2e/ssr.spec.ts` (Cache-Control routing, 304 on identical content, distinct routes → distinct hashes, AbortController fast release).

## Why `provideRealRouterFactory` (not `provideRealRouter`)?

`provideRealRouter(router)` creates a single `useValue` provider — fine for SPA / SSG client (post-hydrate). But `AngularNodeAppEngine` owns the per-request lifecycle, and the SAME application Injector is created fresh for every request. A single router instance shared across requests would leak state between concurrent users.

`provideRealRouterFactory({ baseRouter, plugins, deps })` uses `useFactory`:
- Reads `inject(REQUEST, { optional: true })`
- Calls `cloneRouter(baseRouter, deps?.(request))` — request-scoped clone
- Applies plugins (function form differentiates client vs server)
- Async start via `provideAppInitializer(async () => router.start(...))`
- `DestroyRef.onDestroy(() => router.dispose())` cleanup per-request

See [`packages/angular/CLAUDE.md` → SSR Support](../../../../../packages/angular/CLAUDE.md#ssr-support) and the [RFC](../../../../../.claude/rfc-angular-ssr-factory-ru.md) for the full design rationale.

## Running

```bash
pnpm dev          # ng serve — Angular dev server with HMR (no SSR)
pnpm build:app    # ng build — outputs dist/ssr-angular-example/{browser,server}/
pnpm preview      # node server-runner.mjs — runs Express + AngularNodeAppEngine on :4173
pnpm test:e2e     # Playwright tests
```

## Why `server-runner.mjs`?

`outputMode: "server"` produces a `server.mjs` whose `isMainModule(import.meta.url)` check SHOULD start a listener when invoked via `node server.mjs`. That path has been historically fragile across @angular/ssr versions (see plan §6.5.1 finding 3 — the original Angular implementation attempt couldn't get the standalone listener to fire). `server-runner.mjs` is a stable wrapper that explicitly imports `app` from the compiled server bundle and calls `listen()`.

## Required: `security.allowedHosts: ["localhost"]`

`angular.json` pins `security.allowedHosts: ["localhost"]` for the application builder. Angular 21 SSR rejects unrecognized hosts by default (SSRF prevention) — without this allow-list, the server returns 403 for every request to `http://localhost:4173/*`, and the e2e suite cannot run. Production deployments must extend this list to the actual hostnames they serve (e.g. `["my-app.example.com"]`).

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/angular` — `provideRealRouterFactory`, `injectRoute`, `<route-view>`, `<a realLink>`
- `@real-router/ssr-data-plugin` — per-route data loading via interceptor
- `@real-router/browser-plugin` — client-side URL sync (only on client, not server)
- `@angular/ssr` — `AngularNodeAppEngine`, `provideServerRendering`, `withRoutes`

## See Also

- [`examples/web/vue/ssr-examples/ssr/`](../../../vue/ssr-examples/ssr) — Vue 3 counterpart with the same e2e contract
- [`examples/web/solid/ssr-examples/ssr/`](../../../solid/ssr-examples/ssr) — Solid counterpart
- [`examples/web/svelte/ssr-examples/ssr/`](../../../svelte/ssr-examples/ssr) — Svelte counterpart
- [Angular Integration wiki](https://github.com/greydragon888/real-router/wiki/Angular-Integration#server-side-rendering)
