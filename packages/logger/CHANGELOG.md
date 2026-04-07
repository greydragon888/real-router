# logger

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
