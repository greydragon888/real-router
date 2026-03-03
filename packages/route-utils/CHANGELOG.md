# @real-router/route-utils

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
