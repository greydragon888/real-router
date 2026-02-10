# @real-router/core

## 0.11.0

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

## 0.10.0

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

## 0.9.0

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

## 0.8.0

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

## 0.7.0

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

## 0.6.0

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

## 0.5.0

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

## 0.4.0

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

## 0.3.0

### Minor Changes

- [`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal architecture to namespace-based design (#34)

  Internal refactoring from functional decorator composition to class-based namespace architecture:
  - 11 namespace classes with true encapsulation via private fields (`#`)
  - Clean separation of concerns (Options, Dependencies, State, Routes, Navigation, etc.)
  - Improved maintainability and testability

  **No breaking changes** — public API remains 100% backward compatible.

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

### Patch Changes

- Updated dependencies [[`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/types@0.2.0

## 0.2.4

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

## 0.2.3

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

## 0.2.2

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/logger@0.2.0

## 0.2.1

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

## 0.2.0

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

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - core-types@0.1.0
  - route-tree@0.1.0
