---
"@real-router/angular": minor
---

Add opt-in scroll restoration via `provideRealRouter(router, { scrollRestoration })` (#497)

`provideRealRouter` now accepts an optional options bag. When `scrollRestoration` is provided, the adapter creates a `createScrollRestoration` instance via `provideEnvironmentInitializer`; teardown is wired through `DestroyRef`.

```ts
import { provideRealRouter } from "@real-router/angular";

bootstrapApplication(AppComponent, {
  providers: [
    provideRealRouter(router, { scrollRestoration: { mode: "restore" } }),
  ],
});
```

Supports `manual` / `top` / `restore` modes and a custom scroll container. Direction is read from `@real-router/navigation-plugin`'s `state.context.navigation`; position is persisted across reloads via `sessionStorage` + `pagehide`.
