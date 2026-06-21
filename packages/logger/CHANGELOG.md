# logger

## 0.3.2

### Patch Changes

- [#894](https://github.com/greydragon888/real-router/pull/894) [`0ef5ed0`](https://github.com/greydragon888/real-router/commit/0ef5ed08775704a091f2b9d9b2a073a233bb09e6) Thanks [@greydragon888](https://github.com/greydragon888)! - Ignore a `callback` inherited from the config object's prototype in `logger.configure()` ([#792](https://github.com/greydragon888/real-router/issues/792))

  `configure()` detected the callback key with `"callback" in config`, which walks the prototype chain — so `configure(Object.create({ callback }))` installed an inherited callback. It now uses `Object.hasOwn(config, "callback")`, so only an own property is merged. Explicitly passing `{ callback: undefined }` still clears the callback as before.

- [#894](https://github.com/greydragon888/real-router/pull/894) [`0ef5ed0`](https://github.com/greydragon888/real-router/commit/0ef5ed08775704a091f2b9d9b2a073a233bb09e6) Thanks [@greydragon888](https://github.com/greydragon888)! - Reject `Object.prototype` keys as the configured level in `logger.configure()` ([#895](https://github.com/greydragon888/real-router/issues/895))

  `configure()` validated the level with `config.level in LEVEL_CONFIGS`, which walks the prototype chain — so inherited keys like `"toString"` or `"valueOf"` passed validation and were stored as the active level, corrupting the cached threshold (it became an inherited function, so every message bypassed the filter). It now uses `Object.hasOwn(LEVEL_CONFIGS, config.level)`, so only own, known levels are accepted; every other string throws `Invalid log level` as before. Mirrors the own-property fix applied to the `callback` key in [#792](https://github.com/greydragon888/real-router/issues/792).

- [#894](https://github.com/greydragon888/real-router/pull/894) [`0ef5ed0`](https://github.com/greydragon888/real-router/commit/0ef5ed08775704a091f2b9d9b2a073a233bb09e6) Thanks [@greydragon888](https://github.com/greydragon888)! - Freeze the exported `LEVEL_CONFIGS` and `LOG_LEVELS` constants ([#897](https://github.com/greydragon888/real-router/issues/897))

  `LEVEL_CONFIGS` / `LOG_LEVELS` were exported as plain mutable objects despite backing the process-global threshold logic of the singleton `logger`. Mutating one (`LEVEL_CONFIGS["error-only"] = -100`, or `delete LEVEL_CONFIGS.none`) silently corrupted log filtering for the whole process, including core's own logs. Both are now `Object.freeze`d, so the runtime matches the `Record`/readonly intent — same own-property/immutability discipline already applied to the `callback` ([#792](https://github.com/greydragon888/real-router/issues/792)) and `level` ([#895](https://github.com/greydragon888/real-router/issues/895)) inputs.

## 0.3.1

### Patch Changes

- [#891](https://github.com/greydragon888/real-router/pull/891) [`d78f15e`](https://github.com/greydragon888/real-router/commit/d78f15e3f9bfd8d829ef72bea7e3816025b22603) Thanks [@greydragon888](https://github.com/greydragon888)! - Guard against re-entrant logger callbacks ([#791](https://github.com/greydragon888/real-router/issues/791))

  A `callback` that itself calls `logger.*` on the happy path used to recurse through `#invokeCallback` until a swallowed `RangeError` (~5.9k self-calls and `console.error` per single log). A `#inCallback` re-entrancy guard now skips the nested callback invocation, turning the pattern into a safe no-op. Console output is unaffected: the nested message is still written once.

## 0.3.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

## 0.2.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

## 0.2.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

## 0.2.1

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, API table, log levels matrix, Sentry and React Native use case examples.

## 0.2.0

### Minor Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality
