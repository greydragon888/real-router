# @real-router/route-utils

## 0.1.13

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/types@0.31.2

## 0.1.12

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/types@0.31.1

## 0.1.11

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/types@0.31.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/types@0.30.0

## 0.1.9

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/types@0.29.0

## 0.1.8

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/types@0.28.0

## 0.1.7

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/types@0.27.0

## 0.1.6

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/types@0.26.0

## 0.1.5

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, RouteUtils and Segment Testers tables, fixed curried `startsWithSegment` example, performance complexity table.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/types@0.24.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0

## 0.1.0

### Minor Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/route-utils` — cached read-only query API for route tree (#214)

  New optional package providing `RouteUtils` class and `getRouteUtils()` factory with three query methods.
  All methods return strings (route full names), not internal `RouteTree` nodes:
  - `getChain(name)` — cumulative name segments as `string[]` (cached). Parent is `chain.at(-2)`.
  - `getSiblings(name)` — non-absolute sibling full names excluding self (cached)
  - `isDescendantOf(child, parent)` — O(k) string prefix check

  `getRouteUtils(root)` caches instances via `WeakMap` — same root always returns same instance. Cache invalidates automatically when the immutable tree is replaced (new root on mutation).

  ```typescript
  import { getPluginApi } from "@real-router/core";
  import { getRouteUtils } from "@real-router/route-utils";

  const plugin: PluginFactory = (router) => {
    const tree = getPluginApi(router).getTree();
    const utils = getRouteUtils(tree);

    return {
      onTransitionSuccess(toState) {
        const chain = utils.getChain(toState.name); // cached, no re-allocation
      },
    };
  };
  ```

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Integrate `@real-router/helpers` into `@real-router/route-utils` (#214)

  `@real-router/helpers` is removed. All its functionality is now available in `@real-router/route-utils`.

  **Standalone functions** (same API as the former `@real-router/helpers`):
  - `startsWithSegment(route, segment?)` — prefix match with currying support
  - `endsWithSegment(route, segment?)` — suffix match with currying support
  - `includesSegment(route, segment?)` — anywhere match with currying support
  - `areRoutesRelated(route1, route2)` — hierarchy check (same, parent-child, or child-parent)

  **Static facade on `RouteUtils`**:
  - `RouteUtils.startsWithSegment`
  - `RouteUtils.endsWithSegment`
  - `RouteUtils.includesSegment`
  - `RouteUtils.areRoutesRelated`

  Also exports `SegmentTestFunction` type.

  **Migration:**

  ```diff
  - import { startsWithSegment, areRoutesRelated } from "@real-router/helpers";
  + import { startsWithSegment, areRoutesRelated } from "@real-router/route-utils";
  ```
