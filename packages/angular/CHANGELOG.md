# @real-router/angular

## 0.4.0

### Minor Changes

- [#539](https://github.com/greydragon888/real-router/pull/539) [`2f39d54`](https://github.com/greydragon888/real-router/commit/2f39d54f82dfb62da5309d8520d4c7d8281c52d6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouteSelf` directive (`<ng-template routeSelf>`) for the parent-as-list pattern ([#538](https://github.com/greydragon888/real-router/issues/538))

  `RouteSelf` is a structural directive (mirrors `RouteMatch`/`RouteNotFound`)
  that marks an `ng-template` as the "self" slot for `<route-view>`. The
  template is rendered when the active route name equals the parent
  `<route-view>`'s `routeNode` input and no descendant `RouteMatch` is active.

  ```html
  <route-view [routeNode]="'users'">
    <ng-template routeSelf>
      <users-list />
    </ng-template>
    <ng-template routeMatch="profile">
      <user-profile />
    </ng-template>
  </route-view>
  ```

  Priority: `RouteMatch` (descendant) → `RouteSelf` (active equals `routeNode`)
  → `RouteNotFound` (`UNKNOWN_ROUTE`). Multiple `RouteSelf` instances follow
  first-wins (declaration order from `contentChildren`). Exported as `RouteSelf`
  from `@real-router/angular`.

## 0.3.0

### Minor Changes

- [#502](https://github.com/greydragon888/real-router/pull/502) [`dcfd9cc`](https://github.com/greydragon888/real-router/commit/dcfd9cc2578c22449d2653d25d0b09a0fdb74681) Thanks [@greydragon888](https://github.com/greydragon888)! - Add opt-in scroll restoration via `provideRealRouter(router, { scrollRestoration })` ([#497](https://github.com/greydragon888/real-router/issues/497))

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

## 0.2.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.2.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `injectRoute<P>()` / `RouteSignals<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `injectRoute<P>()` now accepts an optional generic so `routeState().route?.params` is typed without `as` casts. `RouteSignals<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the function.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const route = injectRoute<SearchParams>();
  const q = route.routeState().route?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.1.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `injectRouterTransition` / `RouterErrorBoundary` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated `injectRouterTransition` and `RouterErrorBoundary` to `getTransitionSource` / `getErrorSource` from `@real-router/sources`. The cached shared wrapper ignores external `destroy()` — safe alongside `sourceToSignal.destroy()` that runs in `DestroyRef.onDestroy`.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.1.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial Angular 21 adapter for Real-Router ([#462](https://github.com/greydragon888/real-router/issues/462))

  New package `@real-router/angular` — signal-based, zoneless-compatible bindings for Angular 21+. Built with ng-packagr (partial Ivy compilation, FESM2022 ESM-only output).

  **Public API:**
  - `provideRealRouter(router)` — environment providers for DI
  - Injection tokens: `ROUTER`, `NAVIGATOR`, `ROUTE`
  - `inject*` functions: `injectRouter`, `injectNavigator`, `injectRoute`, `injectRouteNode`, `injectRouteUtils`, `injectRouterTransition`, `injectIsActiveRoute`
  - Components: `RouteView`, `RouterErrorBoundary`, `NavigationAnnouncer`
  - Directives: `RouteMatch`, `RouteNotFound`, `RealLink`, `RealLinkActive`
  - `sourceToSignal(source)` — bridge for RouterSource to Angular Signal

  **Features:**
  - Signal-first reactive state via `sourceToSignal` (no RxJS dependency)
  - Declarative route matching with `<route-view>` + `ng-template routeMatch="..."` / `ng-template routeNotFound`
  - WCAG-compliant navigation announcements via `NavigationAnnouncer` component
  - Link shipped with `shallowEqual`-based props equality from day 1 (same hot-path optimization as the other adapters)
  - Shared `dom-utils` (link utilities, route announcer) materialized from `shared/dom-utils/` via `prebundle` script — ng-packagr does not follow symlinks the same way tsdown does

  **Coverage threshold 94/84/94/94 (statements/branches/functions/lines)** — JIT TestBed does not bind signal `input()` in templates, so directive callbacks and `contentChildren` paths are unreachable without AOT. See `packages/angular/CLAUDE.md` for the full list of lines excluded from JIT coverage.

  **Peer dependencies:** `@angular/core >= 21.0.0`, `@angular/common >= 21.0.0`.
