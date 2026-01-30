# @real-router/core

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
