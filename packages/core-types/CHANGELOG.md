# @real-router/types

## 0.16.0

### Minor Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `ActivationFn` and `ActivationFnFactory` types (#187)

  **Breaking Change:** `ActivationFn` and `ActivationFnFactory` types have been removed. Use `GuardFn` and `GuardFnFactory` instead — guards return `boolean | Promise<boolean>` only.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Consolidate Router-dependent types into `@real-router/types` (#184)
  - Expand `Router` interface from 6 to 15 methods, make generic `Router<D>`
  - Move factory types (`PluginFactory`, `GuardFnFactory`, `ActivationFnFactory`) from `@real-router/core` using interface self-reference
  - Move route config types (`Route`, `RouteConfigUpdate`) from `@real-router/core`
  - Add `EventMethodMap` type-level computation to constants
  - Add API interfaces (`PluginApi`, `RoutesApi`, `DependenciesApi`, `LifecycleApi`) in new `api.ts`

  All types are now importable from `@real-router/types` without depending on `@real-router/core`.

## 0.15.0

### Minor Changes

- [#136](https://github.com/greydragon888/real-router/pull/136) [`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove middleware types (#133)

  **Breaking Change:** Middleware types removed following middleware layer removal in `@real-router/core`.
  - Removed `MiddlewareFn`, `Middleware`, `MiddlewareFactory` types
  - `TransitionPhase` narrowed from `"deactivating" | "activating" | "middleware"` to `"deactivating" | "activating"`

## 0.14.0

### Minor Changes

- [#134](https://github.com/greydragon888/real-router/pull/134) [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `GuardFn` type for dedicated guard signatures (#130)

  New `GuardFn` type narrows guard return type to `boolean | Promise<boolean>`.
  `ActivationFn` remains available for middleware.

## 0.13.0

### Minor Changes

- [#127](https://github.com/greydragon888/real-router/pull/127) [`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove redundant `StateMeta.redirected` and `StateMeta.source` fields (#121)

  **Breaking change:** `StateMeta` no longer includes `redirected` or `source` fields.

  **Migration:**

  ```diff
  - if (state.meta.redirected) { ... }
  + if (state.meta.options.redirected) { ... }
  ```

  The `source` field was dead code — no consumer ever read it, so no migration is needed.

## 0.12.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add TransitionMeta types and ROUTER_DISPOSED error code (#123)

  New types: `TransitionMeta`, `TransitionPhase`, `TransitionReason`. New error code: `ROUTER_DISPOSED` for disposed router operations.

## 0.11.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(types)!: remove callback types, simplify navigation signatures (#45)

  **Breaking Change:**
  - `DoneFn` type removed
  - `CancelFn` type removed
  - `ActivationFn` simplified — `done` callback parameter removed
  - `Navigator.navigate()` returns `Promise<State>` (was `CancelFn`)

  ```typescript
  // Before
  type ActivationFn = (toState, fromState, done: DoneFn) => ...;

  // After
  type ActivationFn = (toState, fromState) => boolean | Promise<boolean | State | void> | State | void;
  ```

## 0.10.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `getNavigator` from Router interface (#83)

  Remove `getNavigator` from Router interface.

## 0.9.0

### Minor Changes

- [#80](https://github.com/greydragon888/real-router/pull/80) [`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add guard API and Navigator type signatures (#42)
  - Add `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard` to Router interface.
  - Add `canNavigateTo` to Router and Navigator interfaces.
  - Remove deprecated `canActivate` and `canDeactivate` from Router interface.

## 0.8.0

### Minor Changes

- [#78](https://github.com/greydragon888/real-router/pull/78) [`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `skipTransition` from `NavigationOptions` type (#44)

  **Breaking Change:** The `skipTransition` field has been removed from the `NavigationOptions` interface.

## 0.7.0

### Minor Changes

- [#75](https://github.com/greydragon888/real-router/pull/75) [`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `ForwardToCallback` type for dynamic route forwarding (#43)

  New generic type `ForwardToCallback<Dependencies>` — a sync callback `(getDependency, params) => string` that enables runtime-conditional route forwarding.

## 0.6.0

### Minor Changes

- [#72](https://github.com/greydragon888/real-router/pull/72) [`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `DefaultRouteCallback` and `DefaultParamsCallback` types (#39)

  New callback type aliases for dynamic `defaultRoute` and `defaultParams` options. `Options.defaultRoute` is now `string | DefaultRouteCallback`, `Options.defaultParams` is now `Params | DefaultParamsCallback`.

## 0.5.0

### Minor Changes

- [#57](https://github.com/greydragon888/real-router/pull/57) [`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `LimitsConfig` interface and `limits` option (#38)

  New `LimitsConfig` interface defines 6 configurable router limits:
  - `maxDependencies`, `maxPlugins`, `maxMiddleware`
  - `maxListeners`, `maxEventDepth`, `maxLifecycleHandlers`

  The `Options` interface now includes `limits?: Partial<LimitsConfig>`.

## 0.4.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `Navigator` interface for safe router subset (#37)

  New `Navigator` interface providing minimal router API for UI components:
  - `navigate()` — navigate to route
  - `getState()` — get current state
  - `isActiveRoute()` — check if route is active
  - `subscribe()` — subscribe to route changes

## 0.3.0

### Minor Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `noValidate` option to disable validation in production (#53)

  New configuration option for performance-critical environments:

  ```typescript
  const router = createRouter(routes, {
    noValidate: process.env.NODE_ENV === "production",
  });
  ```

  When enabled, skips argument validation in ~40 public methods.
  Constructor always validates options object itself.

## 0.2.0

### Minor Changes

- [#34](https://github.com/greydragon888/real-router/pull/34) [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Move Router-dependent types from `@real-router/types` to `@real-router/core` (#31)

  Types moved to `@real-router/core`:
  - `Router` (class replaces interface)
  - `Route`
  - `RouteConfigUpdate`
  - `ActivationFnFactory`
  - `MiddlewareFactory`
  - `PluginFactory`
  - `BuildStateResultWithSegments`

  **Migration:** If you import these types from `@real-router/types`, change your imports to `@real-router/core`:

  ```diff
  - import type { Router, Route, PluginFactory } from "@real-router/types";
  + import type { Router, Route, PluginFactory } from "@real-router/core";
  ```

  This change eliminates circular type dependencies between packages.

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality
