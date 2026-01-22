# @real-router/logger-plugin

## 0.2.0

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

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - logger@0.1.0
  - @real-router/core@0.1.0
