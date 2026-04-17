# @real-router/angular

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
