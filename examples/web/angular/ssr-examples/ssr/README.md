# SSR Angular Example

Server-side rendering with Real-Router, Angular 21, `@angular/ssr` (`AngularNodeAppEngine`), and Express — the Angular port of the React/Vue/Solid/Svelte `ssr/` examples.

## What This Demonstrates

- **`provideRealRouterFactory({ baseRouter, plugins, deps })`** — per-request router scope via Angular's `REQUEST: InjectionToken<Request | null>`. Each request gets an isolated router clone via `cloneRouter(baseRouter, deps?.(request))`, started by `provideAppInitializer`, disposed via `DestroyRef.onDestroy`.
- **Conditional `plugins` function form** — `browser-plugin` registered only on the client; the server registers `ssrDataPluginFactory(loaders)` only.
- **Per-request DI deps** — `currentUser` derived from `request.headers.get("cookie")` on the server, from `document.cookie` on the client (after hydration).
- **`@angular/ssr` modern API** — `AngularNodeAppEngine.handle(req)` + `writeResponseToNodeResponse` (NOT the deprecated `CommonEngine`).
- **Server-side data loading** via `@real-router/ssr-data-plugin` — route loaders run during `router.start(url)` and write to `state.context.data`. Components read it via `injectRoute()` signal.
- **Cookie-based auth-gated routes** — `dashboard` and `admin` protected by `canActivate` guards consuming `getDep("currentUser")`.
- **Query params + nested loaders** — `?sort` on `/users`, leaf-route loader for `/users/:id/posts` returns combined parent + child data.
- **Loader error → 500 page** — rejected loader in `provideAppInitializer` propagates → `bootstrapApplication` rejects → server returns 500 (Option A from RFC §10).
- **Client-side navigation** — after hydration, `@real-router/browser-plugin` handles SPA navigation through `realLink` directive.
- **Incremental hydration** — `provideClientHydration(withIncrementalHydration())` enables per-component hydration triggers.

## Architecture

```
src/
  _auth.ts               Cookie parsing → currentUser DI (works server + client)
  _known-users.ts        KNOWN_USERS table + parseCookieHeader + lookupUserFromCookies
  database.ts            In-memory mock store
  app.config.ts          Shared providers: provideZonelessChangeDetection, provideRealRouterFactory
  app.config.server.ts   Server-only: provideServerRendering(withRoutes(serverRoutes))
  app.routes.server.ts   ServerRoute[] — RenderMode.Server for all paths
  app.component.ts       Root standalone component — <route-view> + <ng-template routeMatch>
  main.ts                Client entry — bootstrapApplication + provideClientHydration(withIncrementalHydration())
  main.server.ts         Server bootstrap — accepts BootstrapContext, returns bootstrapApplication
  server.ts              Express + AngularNodeAppEngine + writeResponseToNodeResponse
  router/
    createBaseRouter.ts  createRouter(routes, options) — base for cloneRouter per request
    routes.ts            Route definitions with auth guards
    loaders.ts           Per-route data loaders
  pages/
    home, users-list, user-profile, user-posts, dashboard, admin, not-found (.component.ts)

server-runner.mjs        Node.js wrapper — imports `app` from compiled server.mjs and calls listen
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
        # browser-plugin's start interceptor wraps with location-derived path,
        # ssr-data-plugin re-runs loader → state.context.data restored
    → Angular claims server-rendered DOM (no flash, no mismatch)
```

## SSR-Only Plugin Contract

The `@real-router/ssr-data-plugin` intercepts `router.start()`, **not** `router.navigate()`. After hydration, subsequent CSR navigations via `realLink` do NOT re-run loaders — `state.context.data` becomes `undefined` for the target route. This matches the Vue/Solid/Svelte/React `ssr/` examples. Use `lifecycle-plugin`'s `onNavigate` if you need data fetching on every navigation.

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
