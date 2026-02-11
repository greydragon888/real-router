# @real-router/rx

## 0.1.6

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

## 0.1.0

### Minor Changes

- [#59](https://github.com/greydragon888/real-router/pull/59) [`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial release of @real-router/rx (#41)

  New package providing zero-cost opt-in Observable functionality for Real-Router:
  - `state$(router)` — reactive state stream with replay semantics
  - `events$(router)` — typed event stream for all router events
  - `observable(router)` — TC39 Observable wrapper for RxJS interop
  - Operators: `map`, `filter`, `debounceTime`, `distinctUntilChanged`, `takeUntil`
  - `pipe()` for operator composition (supports 1-9 operators)
  - `Symbol.asyncIterator` for `for await...of` support
  - AbortSignal support for automatic unsubscription
  - Full TC39 Observable compliance with `Symbol.observable` and `@@observable`

  **Design decisions:**
  - `unsubscribe()` does not trigger `complete` callback — aligns with TC39 Observable spec
  - `distinctUntilChanged` comparator receives `(previous, current)` matching RxJS convention
  - `debounceTime` flushes pending value on source `complete`
  - `debounceTime` validates duration parameter (throws RangeError on negative/NaN/Infinity)
  - `filter` operator has type guard overload
  - Unhandled errors reported via `console.error`

  **Example:**

  ```typescript
  import { state$, map, filter, distinctUntilChanged } from "@real-router/rx";

  state$(router)
    .pipe(
      map(({ route }) => route.params.userId),
      filter((id) => id !== undefined),
      distinctUntilChanged(),
    )
    .subscribe((userId) => fetchUser(userId));
  ```

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0
