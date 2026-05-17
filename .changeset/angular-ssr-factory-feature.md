---
"@real-router/angular": minor
---

Add `provideRealRouterFactory` for SSR support (#582)

New `provideRealRouterFactory({ baseRouter, plugins, deps })` API enables per-request router scope for Angular SSR (`@angular/ssr` + `outputMode: "server"`) and SSG build-time render via `renderApplication` + `platformProviders` `REQUEST` mock.

The factory uses `useFactory` to clone the base router per request via Angular's `REQUEST: InjectionToken<Request | null>` token, runs `router.start(url)` through `provideAppInitializer`, and disposes the per-request router via `DestroyRef.onDestroy`. Conditional `plugins` function form supports browser-plugin server/client separation.

Existing `provideRealRouter(router)` is unchanged — backward compatible. Both APIs ship in parallel; pick one for the entire application.

See `packages/angular/CLAUDE.md` SSR Support section and RFC `.claude/rfc-angular-ssr-factory-ru.md`. Related parent issue: #581.
