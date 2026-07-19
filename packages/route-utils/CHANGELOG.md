# @real-router/route-utils

## 0.3.0

### Minor Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Depend on `@real-router/core` as a peer and source types from it ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  `route-utils` previously took a direct dependency on the standalone `@real-router/types`
  package. With types folded into `@real-router/core` (wave-2), it now declares
  `@real-router/core` as a **peer** dependency (`workspace:>=0.1.0`) and imports its types from
  `@real-router/core`. Consumers must have `@real-router/core` installed (they already do in
  practice — `route-utils` is only useful alongside a router).

## 0.2.8

### Patch Changes

- [#1433](https://github.com/greydragon888/real-router/pull/1433) [`85b31d3`](https://github.com/greydragon888/real-router/commit/85b31d3a95badbc968164a5aeb1e95a7b667ba22) Thanks [@greydragon888](https://github.com/greydragon888)! - Segment testers match via flat string comparisons — no RegExp engine ([#1432](https://github.com/greydragon888/real-router/issues/1432))

  `startsWithSegment` / `endsWithSegment` / `includesSegment` no longer build and execute cached RegExps: matching reduces to prefix/suffix/occurrence checks with a dot-or-edge boundary, exactly equivalent to the historical patterns (property-locked against an inline regex reference). Validation is unchanged and still once-per-segment. Cuts the cold-path cost every adapter's `RouteView` pays per navigation — react deep-config@90: **−31 % totalMs** (conservative ABAB browser A/B).

## 0.2.7

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/types@0.39.0

## 0.2.6

### Patch Changes

- [#1136](https://github.com/greydragon888/real-router/pull/1136) [`db88fdd`](https://github.com/greydragon888/real-router/commit/db88fdd70418f70deb7c8bbc76d0103ce07550e9) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix curried segment testers returning a boolean for an empty/non-string route name ([#769](https://github.com/greydragon888/real-router/issues/769))

  `startsWithSegment` / `endsWithSegment` / `includesSegment` promise a tester function for the single-argument (curried) form, but the route-name validation short-circuited to `false` before the currying branch. A single-arg call on an empty or non-string route name returned a boolean typed as a function, crashing with an unrelated `TypeError` at the eventual call site.

  - Defer the route-name check (computed once as `invalidName`) into each return path so the single-arg form always yields a `(segment: string) => boolean` tester, and that tester returns `false` for any segment.
  - Direct-form output is unchanged: an empty/non-string name still returns `false` (the check runs before the segment-type guard, so no new `TypeError`).

## 0.2.5

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/types@0.38.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/types@0.37.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/types@0.36.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/types@0.35.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/types@0.34.0

## 0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/types@0.33.0

## 0.1.14

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/types@0.32.0

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
