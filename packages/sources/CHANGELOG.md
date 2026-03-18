# @real-router/sources

## 0.2.4

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, source factories table with lazy/eager info, transition tracking example. ARCHITECTURE: added `createTransitionSource` to codemap, types, and test coverage list.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0
  - @real-router/route-utils@0.1.5

## 0.2.3

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

## 0.2.2

### Patch Changes

- [#301](https://github.com/greydragon888/real-router/pull/301) [`830df9a`](https://github.com/greydragon888/real-router/commit/830df9ade36273df81acaef74926c7f4e9eacc0b) Thanks [@greydragon888](https://github.com/greydragon888)! - Deduplicate all source implementations via `BaseSource` composition ([#287](https://github.com/greydragon888/real-router/issues/287))

  Replaced all 4 wrapper classes (`RouteSource`, `RouteNodeSource`, `ActiveRouteSource`, `TransitionSource`) with factory functions that compose `BaseSource` directly. Added `onFirstSubscribe`/`onLastUnsubscribe`/`onDestroy` lifecycle hooks and auto-bound methods to `BaseSource`, eliminating all jscpd-reported code clones in the package.

## 0.2.1

### Patch Changes

- [#276](https://github.com/greydragon888/real-router/pull/276) [`7faf4c2`](https://github.com/greydragon888/real-router/commit/7faf4c24189b7f21c4c309503000e13317ffc01a) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `RouteNodeSource` leaking router subscriptions on unmount ([#270](https://github.com/greydragon888/real-router/issues/270))

  Converted `RouteNodeSource` from eager to lazy-connection pattern: the router subscription is now created on the first listener and removed when the last listener unsubscribes. Snapshot is reconciled with current router state on reconnection to handle Activity hide/show cycles. `destroy()` remains available but is no longer required.

## 0.2.0

### Minor Changes

- [#268](https://github.com/greydragon888/real-router/pull/268) [`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createTransitionSource` for transition lifecycle subscriptions ([#259](https://github.com/greydragon888/real-router/issues/259))

  New source that tracks router transition state (start/success/error/cancel)
  via `getPluginApi().addEventListener()`. Provides `RouterTransitionSnapshot`
  with `isTransitioning`, `toRoute`, and `fromRoute`.

  Dependency change: `@real-router/core` replaces `@real-router/types`.

## 0.1.4

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0
  - @real-router/route-utils@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0
  - @real-router/route-utils@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0
  - @real-router/route-utils@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0
  - @real-router/route-utils@0.1.1

## 0.1.0

### Minor Changes

- [#218](https://github.com/greydragon888/real-router/pull/218) [`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/sources` — framework-agnostic subscription layer for router state (#217)

  Three factory functions for UI adapter authors:
  - `createRouteStore(router)` — subscribe to all navigations
  - `createRouteNodeStore(router, nodeName)` — subscribe to specific route node
  - `createActiveRouteStore(router, routeName, params?, options?)` — track route activity
