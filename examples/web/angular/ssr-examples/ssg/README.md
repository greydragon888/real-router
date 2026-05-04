# SSG Angular Example

Static site generation with Real-Router, Angular 21, `@angular/ssr` build pipeline, and `getStaticPaths()` — the Angular port of the React/Vue/Solid/Svelte `ssg/` examples.

## What This Demonstrates

- **`provideRealRouterFactory({ baseRouter, plugins })`** — same factory as the runtime SSR example, with `REQUEST` flowing per URL through `AngularNodeAppEngine`'s request scope.
- **Static path enumeration** via `getStaticPaths(router, entries)` from `@real-router/core/utils` — auto-discovers leaf routes from the router tree; dynamic routes (`users.profile`) get parameter sets via `entries.ts`.
- **In-process SSR for build-time render** — `scripts/ssg-build.ts` boots the compiled `@angular/ssr` server in-process on a build-only port, fetches each URL, and persists the streamed HTML to `dist/.../browser/<url>/index.html`.
- **Per-page SEO meta** — `meta.ts` resolves a `PageMeta` per route (title, description, canonical path, og:type, og:image). `ssg-build.ts` injects `<title>`, `<meta description>`, `<link rel="canonical">`, OpenGraph (`og:type`/`title`/`description`/`url`/`image`) and `twitter:card` tags via the `<!--ssg-meta-->` placeholder. Each pre-rendered page ships a per-id canonical URL so search engines can deduplicate properly.
- **404.html fallback + sitemap.xml** — generated as part of the build alongside route HTML files.
- **Filesystem layout assertions** — the e2e suite reads `dist/.../browser/` directly to verify (a) every pre-rendered route maps to exactly one `index.html`, (b) `users/` contains only the ids declared in `entries.ts` (overfetch protection), and (c) `sitemap.xml` matches the on-disk set with no extras and nothing missing.
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

## Limitations and Trade-offs

This is a deliberately small SSG demo. Things it does **not** do, and would-be users should know:

- **Loader runs again on the client during hydration.** The same `ssr-data-plugin` is registered on both server and client (see `app.config.ts`). At build time the loader resolves data → static HTML is written. On first paint the JS bundle re-runs `start(url)` and the loader fires a second time. For the in-memory `database.ts` it is invisible; for a real `fetch()` it is one extra roundtrip per route. **No `__SSG_STATE__` blob is serialized into the static HTML** — adding one is application-level work, not a router feature. (See `ssr/README.md` → "No SSR-State Serialization" for the same trade-off in the runtime SSR example.)
- **CSR navigation does not refetch loader data.** `ssr-data-plugin` intercepts `start()`, not `navigate()`. After hydration, clicking a `realLink` to `/users/2` fires `router.navigate()` → loader does **not** run → `state.context.data === undefined` → the user-profile component renders the "User not found" branch. This is the same SSR-only contract as the runtime `ssr/` example, verified in e2e scenario 15. If you want client-side data fetching after hydration, add `lifecycle-plugin` `onNavigate`.
- **Not ISR.** No incremental regeneration, no on-demand revalidation, no cache invalidation. Build-time only — to update a page, rebuild and redeploy. ISR would require a runtime SSR server with a cache layer, which is out of scope for this example.
- **404.html and sitemap.xml are application-level outputs**, not plugin features. `scripts/ssg-build.ts` calls `fetch('/__nonexistent')` → writes `404.html`, and assembles `sitemap.xml` from `getStaticPaths()`. Real-Router supplies the route enumeration (`getStaticPaths`); the SEO file generation is bespoke build script logic. Easy to copy into your own SSG pipeline, but don't expect it to work without the script.
- **Sirv's 404 behavior depends on web-server config.** `sirv --single` falls back to `index.html` for unknown URLs. To serve `404.html` with HTTP 404 status (proper SEO signal) you need a real web server (nginx `try_files` rule, Cloudflare Pages `_redirects`, Netlify `_redirects`, etc.) — sirv preview cannot do this alone.

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
