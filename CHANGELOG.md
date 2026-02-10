# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2026-02-10]

### @real-router/core@0.11.0

### Minor Changes

- [#72](https://github.com/greydragon888/real-router/pull/72) [`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5) Thanks [@greydragon888](https://github.com/greydragon888)! - Support dynamic `defaultRoute` and `defaultParams` via callback functions (#39)

  `defaultRoute` and `defaultParams` options now accept callback functions that receive `getDependency` for dynamic value computation based on router dependencies. Callbacks are resolved at point of use (`start()`, `navigateToDefault()`), never cached.

  **Breaking Type Change**: `router.getOptions().defaultRoute` now returns `string | DefaultRouteCallback` (was `string`). Similarly, `router.getOptions().defaultParams` now returns `Params | DefaultParamsCallback` (was `Params`). Code that assigns these values to typed variables may need type assertions or `typeof` checks.

  **Behavior Note**: A callback returning empty string `""` in `navigateToDefault()` returns noop (no navigation). In `start()` without path, it produces `ROUTE_NOT_FOUND` error (not `NO_START_PATH_OR_STATE`).

  ```typescript
  const router = createRouter(routes, {
    defaultRoute: (getDep) =>
      getDep("userRole") === "admin" ? "admin.dashboard" : "home",
    defaultParams: (getDep) => ({ userId: getDep("currentUserId") }),
  });
  ```

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/types@0.6.0

### @real-router/types@0.6.0

### Minor Changes

- [#72](https://github.com/greydragon888/real-router/pull/72) [`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `DefaultRouteCallback` and `DefaultParamsCallback` types (#39)

  New callback type aliases for dynamic `defaultRoute` and `defaultParams` options. `Options.defaultRoute` is now `string | DefaultRouteCallback`, `Options.defaultParams` is now `Params | DefaultParamsCallback`.

### @real-router/browser-plugin@0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/helpers@0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/logger-plugin@0.2.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/persistent-params-plugin@0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/react@0.2.5

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0
  - @real-router/browser-plugin@0.1.14
  - @real-router/helpers@0.1.14

### @real-router/rx@0.1.3

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

## [2026-02-09]

### @real-router/core@0.10.0

### Minor Changes

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `setOption()`, make options immutable (#63)

  **Breaking Change:** Router options are now immutable after construction. The `setOption()` method has been removed along with the `lock()`/`unlock()` lifecycle.

  Options that were previously changeable after `start()` (`defaultRoute`, `defaultParams`) must now be set in the constructor:

  ```diff
  - const router = createRouter(routes);
  - router.setOption('defaultRoute', 'home');
  - router.start();
  + const router = createRouter(routes, { defaultRoute: 'home' });
  + router.start();
  ```

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace rou3 with custom Segment Trie path matcher (#63)

  The internal path matching engine has been replaced from rou3's radix tree to a custom Segment Trie matcher. Each trie edge represents an entire URL segment (not per-character prefix), enabling hierarchical named routing with static cache, pre-computed `buildPath` templates, and zero-allocation match.

  The public API (`matchPath`, `buildPath`, `buildState`) is unchanged.

### Patch Changes

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize `matchPath` by inlining `buildPath` and skipping `defaultParams` re-merge (#63)

### @real-router/browser-plugin@0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/helpers@0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/logger-plugin@0.2.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/persistent-params-plugin@0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/react@0.2.4

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0
  - @real-router/browser-plugin@0.1.13
  - @real-router/helpers@0.1.13

### @real-router/rx@0.1.2

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

## [2026-02-08]

### @real-router/core@0.9.0

### Minor Changes

- [#61](https://github.com/greydragon888/real-router/pull/61) [`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate routing engine to rou3 and optimize path building (#40)

  **BREAKING CHANGES:**
  - Encoding mode `legacy` has been removed. Use `uri` instead (1:1 equivalent).
  - `children.values()` iteration order now follows definition order instead of routing priority order. This affects `routeTreeToDefinitions()` output order. Matching behavior is unchanged (handled by rou3 radix tree).

  **Performance improvements:**
  - Migrated to rou3 radix tree for 1000x+ faster route matching
  - Optimized path building with standalone services (inject, validateConstraints, encodeParam)
  - Replaced parser metadata access with lightweight paramMeta structure
  - Removed dead sorting code (~50 lines) — no longer needed with rou3

  **Migration:**

  ```typescript
  // Before:
  buildPath(tree, "route", params, { urlParamsEncoding: "legacy" });

  // After:
  buildPath(tree, "route", params, { urlParamsEncoding: "uri" });
  ```

### @real-router/types@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### @real-router/browser-plugin@0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/helpers@0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/logger-plugin@0.2.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/persistent-params-plugin@0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/react@0.2.3

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0
  - @real-router/browser-plugin@0.1.12
  - @real-router/helpers@0.1.12

### @real-router/rx@0.1.1

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

## [2026-02-06]

### @real-router/core@0.8.0

### Minor Changes

- [#59](https://github.com/greydragon888/real-router/pull/59) [`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `router[Symbol.observable]()` from core — Observable API moved to `@real-router/rx` (#41)

  **Breaking Change:** `router[Symbol.observable]()` and `router["@@observable"]()` are removed from core.

  **Migration:**

  ```typescript
  // Before
  router[Symbol.observable]().subscribe(observer);

  // After
  import { observable } from "@real-router/rx";
  observable(router).subscribe(observer);

  // Or with state stream
  import { state$ } from "@real-router/rx";
  state$(router).subscribe((state) => console.log(state));
  ```

  **Why:** Achieves zero bundle cost for users who don't need reactive streams (~2KB savings).

### @real-router/rx@0.1.0

### Minor Changes

- [#59](https://github.com/greydragon888/real-router/pull/59) [`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial release of @real-router/rx (#41)

  New package providing zero-cost opt-in Observable functionality for Real-Router:
  - `state$(router)` — reactive state stream with replay semantics
  - `events$(router)` — typed event stream for all router events
  - `observable(router)` — TC39 Observable wrapper for RxJS interop
  - Operators: `map`, `filter`, `debounceTime`, `distinctUntilChanged`, `takeUntil`
  - Full TC39 Observable compliance with `Symbol.observable`

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/browser-plugin@0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/helpers@0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/logger-plugin@0.2.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/persistent-params-plugin@0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/react@0.2.2

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0
  - @real-router/browser-plugin@0.1.11
  - @real-router/helpers@0.1.11

## [2026-02-05]

### @real-router/core@0.7.0

### Minor Changes

- [#57](https://github.com/greydragon888/real-router/pull/57) [`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add configurable limits via `options.limits` (#38)

  All router limits are now centralized into a single configuration object. Previously, limits were hardcoded in individual namespaces.

  ```typescript
  const router = createRouter(routes, {
    limits: {
      maxDependencies: 150,
      maxPlugins: 75,
    },
  });

  // Read-only access
  console.log(router.limits);
  // { maxDependencies: 150, maxPlugins: 75, maxMiddleware: 50, ... }
  ```

  **Available limits:**

  | Limit                  | Default | Description                                |
  | ---------------------- | ------- | ------------------------------------------ |
  | `maxDependencies`      | 100     | Maximum registered dependencies            |
  | `maxPlugins`           | 50      | Maximum registered plugins                 |
  | `maxMiddleware`        | 50      | Maximum middleware functions               |
  | `maxListeners`         | 10000   | Maximum event listeners per event type     |
  | `maxEventDepth`        | 5       | Maximum nested event propagation depth     |
  | `maxLifecycleHandlers` | 200     | Maximum canActivate/canDeactivate handlers |

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/types@0.5.0

### @real-router/types@0.5.0

### Minor Changes

- [#57](https://github.com/greydragon888/real-router/pull/57) [`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `LimitsConfig` interface and `limits` option (#38)

  New `LimitsConfig` interface defines 6 configurable router limits:
  - `maxDependencies`, `maxPlugins`, `maxMiddleware`
  - `maxListeners`, `maxEventDepth`, `maxLifecycleHandlers`

  The `Options` interface now includes `limits?: Partial<LimitsConfig>`.

### @real-router/browser-plugin@0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/helpers@0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/logger-plugin@0.2.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/persistent-params-plugin@0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/react@0.2.1

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0
  - @real-router/browser-plugin@0.1.10
  - @real-router/helpers@0.1.10

## [2026-02-04]

### @real-router/react@0.2.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useNavigator()` hook and update React bindings (#37)

  **New:**
  - `useNavigator()` hook for direct Navigator access
  - `NavigatorContext` for providing Navigator to components

  **BREAKING CHANGE:**
  - `useRoute()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`
  - `useRouteNode()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`

  **Migration:**

  ```tsx
  // Before
  const { router, route } = useRoute();
  router.navigate("home");

  // After
  const { navigator, route } = useRoute();
  navigator.navigate("home");

  // For full Router access:
  const router = useRouter();
  ```

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0
  - @real-router/browser-plugin@0.1.9
  - @real-router/helpers@0.1.9

### @real-router/core@0.6.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `getNavigator()` method (#37)

  New `Router.getNavigator()` method returns a frozen, cached `Navigator` instance with safe subset of router methods for UI components.

  ```typescript
  const navigator = router.getNavigator();
  navigator.navigate("home");
  navigator.getState();
  navigator.isActiveRoute("home");
  navigator.subscribe(listener);
  ```

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/types@0.4.0

### @real-router/types@0.4.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `Navigator` interface for safe router subset (#37)

  New `Navigator` interface providing minimal router API for UI components:
  - `navigate()` — navigate to route
  - `getState()` — get current state
  - `isActiveRoute()` — check if route is active
  - `subscribe()` — subscribe to route changes

### @real-router/browser-plugin@0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/helpers@0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/logger-plugin@0.2.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/persistent-params-plugin@0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/core@0.5.0

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

### Patch Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Make middleware unsubscribe function idempotent (#53)

  Calling unsubscribe multiple times no longer throws an error.

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize `usePlugin()` for single-plugin calls (#53)

  Skip array/Set allocation when registering a single plugin.

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/types@0.3.0

### @real-router/types@0.3.0

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

### @real-router/browser-plugin@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/helpers@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/logger-plugin@0.2.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/persistent-params-plugin@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/react@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0
  - @real-router/browser-plugin@0.1.8
  - @real-router/helpers@0.1.8

## [2026-01-30]

### @real-router/core@0.4.0

### Minor Changes

- [#46](https://github.com/greydragon888/real-router/pull/46) [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572) Thanks [@greydragon888](https://github.com/greydragon888)! - ## Public API Audit — Remove Legacy Internal Methods

  ### Breaking Changes

  **Removed methods:**
  - `isStarted()` — use `isActive()` instead
  - `isNavigating()` — track via middleware/events if needed
  - `forward()` — use `forwardTo` option in route config
  - `setState()` — internal only, use `navigate()` or `navigateToState()`
  - `areStatesDescendants()` — use `state2.name.startsWith(state1.name + ".")`
  - `clearCanActivate()` — override with `canActivate(name, true)`
  - `clearCanDeactivate()` — override with `canDeactivate(name, true)`
  - `removeEventListener()` — use unsubscribe function from `addEventListener()`
  - `makeNotFoundState()` — use `navigateToDefault()` or handle in middleware
  - `getPlugins()` — track plugins in application code if needed
  - `invokeEventListeners()` — internal only
  - `hasListeners()` — internal only
  - `getLifecycleFactories()` — internal only
  - `getLifecycleFunctions()` — internal only
  - `getMiddlewareFactories()` — internal only
  - `getMiddlewareFunctions()` — internal only

  **Plugin Development API:**

  The following methods are now documented for plugin authors:
  - `matchPath()` — match URL path to route state
  - `makeState()` — create State with custom `meta.id`
  - `buildState()` — validate route and build state
  - `forwardState()` — resolve forwarding and merge default params
  - `navigateToState()` — navigate with pre-built State
  - `setRootPath()` — dynamically modify router base path
  - `getRootPath()` — read current base path

  ### Internal Changes
  - Moved validation logic from namespaces to Router facade
  - Namespace methods now trust validated input from facade

  Closes #36

### @real-router/browser-plugin@0.1.7

### Patch Changes

- [`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777) Thanks [@greydragon888](https://github.com/greydragon888)! - Updated to use Plugin Development API

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/helpers@0.1.7

### Patch Changes

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/logger-plugin@0.2.7

### Patch Changes

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/persistent-params-plugin@0.1.7

### Patch Changes

- [`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777) Thanks [@greydragon888](https://github.com/greydragon888)! - Updated to use Plugin Development API

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/react@0.1.7

### Patch Changes

- Updated dependencies [[`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777), [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/browser-plugin@0.1.7
  - @real-router/core@0.4.0
  - @real-router/helpers@0.1.7

## [2026-01-28]

### @real-router/core@0.3.0

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

- [`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal architecture to namespace-based design (#34)

  Internal refactoring from functional decorator composition to class-based namespace architecture:
  - 11 namespace classes with true encapsulation via private fields (`#`)
  - Clean separation of concerns (Options, Dependencies, State, Routes, Navigation, etc.)
  - Improved maintainability and testability

  **No breaking changes** — public API remains 100% backward compatible.

### Patch Changes

- Updated dependencies [[`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/types@0.2.0

### @real-router/types@0.2.0

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

### @real-router/logger@0.2.0

### Minor Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

### @real-router/logger@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### @real-router/browser-plugin@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/browser-plugin@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/browser-plugin@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/browser-plugin@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/logger@0.2.0

### @real-router/browser-plugin@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/core@0.2.4

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

### @real-router/core@0.2.3

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

### @real-router/core@0.2.2

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/logger@0.2.0

### @real-router/core@0.2.1

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

### @real-router/helpers@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/helpers@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/helpers@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/helpers@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2

### @real-router/helpers@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/logger-plugin@0.2.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/logger-plugin@0.2.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/logger-plugin@0.2.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/logger-plugin@0.2.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/logger@0.2.0

### @real-router/logger-plugin@0.2.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/persistent-params-plugin@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/persistent-params-plugin@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/persistent-params-plugin@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/persistent-params-plugin@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2

### @real-router/persistent-params-plugin@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/react@1.0.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0

### @real-router/react@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0
  - @real-router/browser-plugin@0.1.6
  - @real-router/helpers@0.1.6

### @real-router/react@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4
  - @real-router/browser-plugin@0.1.5
  - @real-router/helpers@0.1.5

### @real-router/react@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3
  - @real-router/browser-plugin@0.1.4
  - @real-router/helpers@0.1.4

### @real-router/react@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/browser-plugin@0.1.3
  - @real-router/helpers@0.1.3

### @real-router/react@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1
  - @real-router/browser-plugin@0.1.2
  - @real-router/helpers@0.1.2

## [2026-01-24]

### @real-router/core@0.2.0

### Minor Changes

- [#11](https://github.com/greydragon888/real-router/pull/11) [`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6) Thanks [@greydragon888](https://github.com/greydragon888)! - Add internal isomorphic logger package for centralized logging

  ### New Features

  **Isomorphic Logger** — works in browser, Node.js, and environments without `console`:
  - Three severity levels: `log`, `warn`, `error`
  - Four threshold configurations: `all`, `warn-error`, `error-only`, `none`
  - Safe console access (checks `typeof console !== "undefined"`)
  - Optional callback for custom log processing (error tracking, analytics, console emulation)
  - `callbackIgnoresLevel` option to bypass level filtering for callbacks

  **Router Configuration:**

  ```typescript
  const router = createRouter(routes, {
    logger: {
      level: "error-only",
      callback: (level, context, message) => {
        if (level === "error") Sentry.captureMessage(message);
      },
      callbackIgnoresLevel: true,
    },
  });
  ```

  ### Changes by Package

  **@real-router/core:**
  - Add `options.logger` configuration support in `createRouter()`
  - Migrate all internal `console.*` calls to centralized logger

  **@real-router/browser-plugin:**
  - Migrate warning messages to centralized logger

  **@real-router/logger-plugin:**
  - Use internal logger instead of direct console output

### @real-router/core@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - core-types@0.1.0
  - route-tree@0.1.0

### @real-router/logger-plugin@0.2.0

### Minor Changes

- [#12](https://github.com/greydragon888/real-router/pull/12) [`50b7619`](https://github.com/greydragon888/real-router/commit/50b76194dd27a143d156416de751fca3e314f68b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add performance tracking to logger-plugin

  ### New Features

  **Timing Display** — transition duration with adaptive units:

  ```
  Transition success (15.00ms)   // normal transitions
  Transition success (27.29μs)   // fast transitions (<0.1ms)
  ```

  **Performance API Integration** — marks and measures for browser DevTools

  ### Configuration

  ```typescript
  router.usePlugin(
    loggerPluginFactory({
      showTiming: true, // default: true
      usePerformanceMarks: true, // default: false
    }),
  );
  ```

### @real-router/logger-plugin@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - logger@0.1.0
  - @real-router/core@0.1.0

### @real-router/browser-plugin@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - @real-router/core@0.1.0

### @real-router/helpers@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/core@0.1.0

### @real-router/persistent-params-plugin@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - @real-router/core@0.1.0

### @real-router/react@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0

### @real-router/browser-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/helpers@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/logger-plugin@0.2.1

### Patch Changes

- [#15](https://github.com/greydragon888/real-router/pull/15) [`b83baf1`](https://github.com/greydragon888/real-router/commit/b83baf12f6a4d3e067d1c561ce72195fe9b3bd48) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix logger-plugin configuration options being ignored
  - Replace `logger` singleton with direct `console` calls to make plugin logs independent of router configuration
  - Enable `loggerPluginFactory(options)` to accept configuration parameter
  - Implement `level` option filtering (`all`, `transitions`, `errors`, `none`)
  - Implement `showParamsDiff` option to control parameter diff logging
  - Implement `showTiming` option to control timing information display

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/persistent-params-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/react@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0
  - @real-router/browser-plugin@0.1.1
  - @real-router/helpers@0.1.1

## [0.0.1] - 2025-01-20

### Added

Initial release of Real-Router — a complete rewrite and evolution of the router6 project.

#### Public Packages

| Package                                 | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| `@real-router/core`                     | Core router implementation                      |
| `@real-router/react`                    | React integration (Provider, hooks, components) |
| `@real-router/browser-plugin`           | Browser history and URL synchronization         |
| `@real-router/logger-plugin`            | Development logging with transition tracking    |
| `@real-router/persistent-params-plugin` | Parameter persistence across navigations        |
| `@real-router/helpers`                  | Route comparison and checking utilities         |

#### Core Features

- **TypeScript-first** design with full type safety
- **O(1) route lookup** using Map-based data structures
- **Immutable state** architecture
- **Modern ESM/CJS** builds with tree-shaking support
- **Plugin architecture** for extensibility
- **Middleware support** for navigation pipeline customization
- **Lifecycle guards** (`canActivate` / `canDeactivate`)
- **Observable interface** compatible with RxJS

#### React Integration

- `RouterProvider` — context provider for router instance
- `useRouter` — access router instance
- `useRoute` — subscribe to route changes
- `useRouteNode` — optimized subscription for specific route segments
- `Link` / `ConnectedLink` — navigation components

#### Browser Plugin

- History API integration (pushState / replaceState)
- Hash routing support
- Popstate event handling
- URL building and matching utilities

### Changed

- Renamed all packages from `router6-*` to `@real-router/*`
- Renamed `browserPlugin` to `browserPluginFactory`
- Renamed `loggerPlugin` factory to `loggerPluginFactory`
- Renamed `persistentParamsPlugin` to `persistentParamsPluginFactory`
- Source directory renamed from `modules/` to `src/`

### Migration from router6

If you're migrating from router6 1.0.0:

```diff
- import { createRouter } from "router6";
- import browserPlugin from "router6-plugin-browser";
- import { RouterProvider, useRoute } from "react-router6";
+ import { createRouter } from "@real-router/core";
+ import { browserPluginFactory } from "@real-router/browser-plugin";
+ import { RouterProvider, useRoute } from "@real-router/react";

  const router = createRouter(routes);
- router.usePlugin(browserPlugin());
+ router.usePlugin(browserPluginFactory());
```

---

## History

Real-Router evolved from the router6 project, which was itself a complete rewrite of [router5](https://github.com/router5/router5).

### router6 1.0.0 (2025-01-18)

The final version of router6 before renaming to Real-Router. Key achievements:

- **1.8x to 22x faster** hot-path operations compared to router5
- **O(1) route lookup** instead of O(n) linear search
- Complete TypeScript rewrite with strict type checking
- Modern build system with ESM and CommonJS support

### Acknowledgments

Real-Router is inspired by the declarative routing philosophy of [router5](https://github.com/router5/router5) by Thomas Roch.
