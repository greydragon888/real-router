# @real-router/core

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
