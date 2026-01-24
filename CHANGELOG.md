# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2026-01-24]

### @real-router/logger-plugin@0.2.1

### Patch Changes

- [#15](https://github.com/greydragon888/real-router/pull/15) [`b83baf1`](https://github.com/greydragon888/real-router/commit/b83baf12f6a4d3e067d1c561ce72195fe9b3bd48) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix logger-plugin configuration options being ignored
  - Replace `logger` singleton with direct `console` calls to make plugin logs independent of router configuration
  - Enable `loggerPluginFactory(options)` to accept configuration parameter
  - Implement `level` option filtering (`all`, `transitions`, `errors`, `none`)
  - Implement `showParamsDiff` option to control parameter diff logging
  - Implement `showTiming` option to control timing information display


### @real-router/browser-plugin@0.1.1

### Patch Changes

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

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

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

### @real-router/logger-plugin@0.2.0

### Minor Changes

- [#12](https://github.com/greydragon888/real-router/pull/12) [`50b7619`](https://github.com/greydragon888/real-router/commit/50b76194dd27a143d156416de751fca3e314f68b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add performance tracking to logger-plugin

  ### New Features

  **Timing Display** — transition duration with adaptive units:

  ```
  Transition success (15.00ms)   // normal transitions
  Transition success (27.29μs)   // fast transitions (<0.1ms)
  ```

  **Performance API Integration** — marks and measures for browser DevTools:

  ```
  Marks:
  ├── router:transition-start:{from}→{to}
  ├── router:transition-end:{from}→{to}
  ├── router:transition-cancel:{from}→{to}
  └── router:transition-error:{from}→{to}

  Measures:
  ├── router:transition:{from}→{to}
  ├── router:transition-cancelled:{from}→{to}
  └── router:transition-failed:{from}→{to}
  ```

  ### Configuration

  ```typescript
  router.usePlugin(
    loggerPluginFactory({
      showTiming: true, // default: true
      usePerformanceMarks: true, // default: false
    }),
  );
  ```

  ### Implementation Details
  - Monotonic time provider with environment-aware fallback:
    - Browser: `performance.now()`
    - Node.js 16+: `performance.now()` from `perf_hooks`
    - Node.js <16: `Date.now()` with monotonic emulation (handles NTP sync, DST)
  - Safe Performance API access — graceful no-op if unavailable

### Patch Changes

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

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

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
