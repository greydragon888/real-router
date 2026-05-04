# SSG Angular Example

Static site generation with Real-Router, Angular 21, `@angular/ssr` build pipeline, and `getStaticPaths()` — the Angular port of the React/Vue/Solid/Svelte `ssg/` examples.

## What This Demonstrates

- **`provideRealRouterFactory({ baseRouter, plugins })`** — same factory as the runtime SSR example, with `REQUEST` flowing per URL through `AngularNodeAppEngine`'s request scope.
- **Static path enumeration** via `getStaticPaths(router, entries)` from `@real-router/core/utils` — auto-discovers leaf routes from the router tree; dynamic routes (`users.profile`) get parameter sets via `entries.ts`.
- **In-process SSR for build-time render** — `scripts/ssg-build.ts` boots the compiled `@angular/ssr` server in-process on a build-only port, fetches each URL, and persists the streamed HTML to `dist/.../browser/<url>/index.html`.
- **Per-page meta tags** — `meta.ts` derives `<title>` + `<meta description>` from resolved router state; injected via the `<!--ssg-meta-->` placeholder in `index.html`.
- **404.html fallback + sitemap.xml** — generated as part of the build alongside route HTML files.
- **Sirv for preview** — matches the existing Angular examples convention; serves the pre-rendered static files directly without a runtime SSR server.
- **Client hydration** — `provideClientHydration()` re-attaches the static DOM after the JS bundle loads; `realLink` directive handles SPA navigation post-hydration.

## Architecture

```
src/
  database.ts            In-memory mock store
  app.config.ts          Shared providers — provideZonelessChangeDetection, provideRouter([{path:"**", component:NgRouterStub}]), provideRealRouterFactory(...)
  app.config.server.ts   Server-only — provideServerRendering(withRoutes(serverRoutes), withAppShell(AppComponent))
  app.routes.server.ts   ServerRoute[] with RenderMode.Server (build-time SSR)
  app.component.ts       Root standalone — <route-view> + <ng-template routeMatch>
  main.ts                Client entry — bootstrapApplication + provideClientHydration()
  main.server.ts         Server bootstrap — accepts BootstrapContext, returns bootstrapApplication
  server.ts              SSG-only Express + AngularNodeAppEngine (used in-process by ssg-build.ts)
  router/
    createBaseRouter.ts  createRouter(routes, options)
    routes.ts            Route definitions (home, users, users.profile)
    loaders.ts           Per-route data loaders
    entries.ts           Dynamic route parameter sets (users.profile → id: 1, 2, 3)
    meta.ts              Per-route title + description resolver
  pages/
    home, users-list, user-profile, not-found (.component.ts)

scripts/
  ssg-build.ts           Build script — spins up server.mjs in-process, fetches each URL, writes static HTML
```

## SSG Flow

```
Build time:
  ng build (outputMode: server)
    → produces dist/.../browser/ (client bundle + index.csr.html)
    → produces dist/.../server/server.mjs (AngularNodeAppEngine wrapped Express)

  tsx scripts/ssg-build.ts
    → import server.mjs → app.listen(4174) — in-process SSR server
    → getStaticPaths(baseRouter, entries) → ["/", "/users/1", "/users/2", "/users/3"] + manual "/users"
    → For each URL:
        fetch(http://localhost:4174/<url>) → HTML via AngularNodeAppEngine
        → injectMeta(html, getMetaForState(state)) — per-page <title> + <meta description>
        → writeFileSync(dist/.../browser/<url>/index.html)
    → fetch /__nonexistent → write dist/.../browser/404.html
    → write sitemap.xml
    → process.exit(0) — terminates in-process listener

Runtime (post-build, served by sirv):
  GET /users/1 → sirv → dist/.../browser/users/1/index.html
    → static HTML loads in browser
    → main.js loads, bootstrapApplication runs
    → provideRealRouterFactory creates client router (browser-plugin + ssr-data-plugin)
    → provideClientHydration claims server-rendered DOM
    → No flash, no mismatch
```

## Why "in-process SSR" instead of `renderApplication` direct?

The plan §6.3 originally suggested using `@angular/platform-server.renderApplication(bootstrap, { platformProviders: [{ provide: REQUEST, useValue: ... }] })`. That approach produced `NG0201 No provider found for InjectionToken` with the current @angular/ssr 21.2 setup — `platformProviders` REQUEST does not propagate cleanly into the application Injector when `provideRealRouterFactory` calls `inject(REQUEST, { optional: true })`.

The "boot the SSR server in-process and fetch URLs" approach reuses the **exact same render pipeline** as the runtime SSR example — `AngularNodeAppEngine.handle(req)` knows how to inject REQUEST into the per-request DI scope. This guarantees the SSG output is byte-identical to what the runtime SSR server would produce.

Trade-off: requires `outputMode: "server"` and an `ssr.entry`, even for SSG. The `src/server.ts` placeholder satisfies this build invariant — it is **not** used at runtime (sirv serves the static files).

## Running

```bash
pnpm dev          # ng serve — Angular dev server (no SSG, just CSR)
pnpm build:app    # ng build + tsx scripts/ssg-build.ts → static files in dist/.../browser/
pnpm preview      # sirv dist/ssg-angular-example/browser --port 4173 --quiet
pnpm test:e2e     # Playwright tests
```

## Output

```
dist/ssg-angular-example/browser/
  index.html              ← /
  users/
    index.html            ← /users
    1/index.html          ← /users/1
    2/index.html          ← /users/2
    3/index.html          ← /users/3
  404.html                ← not-found fallback
  sitemap.xml             ← all pre-rendered URLs
  main.js                 ← client bundle (shared across all pages)
```

## Key Packages

- `@real-router/core` — router + `cloneRouter()`
- `@real-router/core/utils` — `getStaticPaths()` for static URL enumeration
- `@real-router/angular` — `provideRealRouterFactory`, `injectRoute`, `<route-view>`, `<a realLink>`
- `@real-router/ssr-data-plugin` — per-route data loading
- `@real-router/browser-plugin` — client-side URL sync after hydration
- `@angular/ssr` — `AngularNodeAppEngine` (used in-process during SSG build)

## See Also

- [`examples/web/vue/ssr-examples/ssg/`](../../../vue/ssr-examples/ssg) — Vue 3 counterpart
- [`examples/web/solid/ssr-examples/ssg/`](../../../solid/ssr-examples/ssg) — Solid counterpart
- [`examples/web/svelte/ssr-examples/ssg/`](../../../svelte/ssr-examples/ssg) — Svelte counterpart
- [`../ssr/README.md`](../ssr/README.md) — runtime SSR example with the same `provideRealRouterFactory` API
