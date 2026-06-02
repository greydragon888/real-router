---
"@real-router/angular": minor
---

Add `scrollSpy` option to `provideRealRouter` / `provideRealRouterFactory` — router-coordinated `IntersectionObserver` URL hash spy (#575)

New `scrollSpy?: ScrollSpyOptions` field on `RealRouterOptions` / `RealRouterFactoryOptions` wires `createScrollSpy(router, options)` from `shared/dom-utils/` via `provideEnvironmentInitializer` + the new shared `installScrollSpy` helper. The URL hash tracks the topmost visible anchor as the user scrolls, syncing `state.context.url.hash` so sibling `<a realLink [hash]>` highlights re-evaluate via the standard `createActiveRouteSource` pipeline.

```typescript
bootstrapApplication(AppComponent, {
  providers: [
    provideRealRouter(router, {
      scrollSpy: { selector: "[id]:is(h2,h3)" },
    }),
  ],
});
```

Available on both `provideRealRouter` (SPA) and `provideRealRouterFactory` (SSR / SSG); on the SSR path the utility correctly NOOP's on the server pass (`document` is undefined). Teardown wired through `inject(DestroyRef)`. Options are a snapshot at bootstrap — not reactive to runtime changes.

Emits a forced same-route transition with `{ hash, replace: true, force: true, hashChange: true }` — same write API as `<a realLink [hash]>` (#532), `replace: true` so the spy doesn't pollute history. Three anti-flicker gates (`isTransitioning`, `coolingDown` cleared on `scrollend` or 500 ms fallback, `selfEmitting`).

Requires `browser-plugin` or `navigation-plugin`. Under `hash-plugin` / `memory-plugin` / no URL plugin → warn-once + NOOP. SSR / browsers without `IntersectionObserver` = NOOP.

The `dom-utils` git-tracked copy now also includes `scroll-spy.ts` (re-materialised from `shared/dom-utils/` via the `prebundle` script — ng-packagr does not follow symlinks).

See [Scroll Spy guide](https://github.com/greydragon888/real-router/wiki/Scroll-Spy).
