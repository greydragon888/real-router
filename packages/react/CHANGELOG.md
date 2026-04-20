# @real-router/react

## 0.18.0

### Minor Changes

- [#494](https://github.com/greydragon888/real-router/pull/494) [`b0cdc41`](https://github.com/greydragon888/real-router/commit/b0cdc410ee97b3b8b7012216f863756be832d729) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/react/ink` subpath export for Ink (terminal UI) ([#493](https://github.com/greydragon888/real-router/issues/493))

  New third entry alongside `main` and `/legacy`, targeting React 19.2+ & Ink 7+. Ships all shared hooks plus two terminal-specific pieces:
  - **`InkRouterProvider`** — wrapper around the shared `RouterProvider` that omits `announceNavigation` (no DOM, no aria-live).
  - **`InkLink`** — focusable text link built on Ink's `useFocus` + `useInput`. Joins the focus ring (Tab to move, Enter to navigate). Props mirror `Link`: `routeName`, `routeParams`, `routeOptions`, `activeStrict`, `ignoreQueryParams`. DOM-only props (`className`, `target`, `onClick`) are replaced with terminal equivalents (`activeColor`, `focusColor`, `inverse`/`activeInverse`/`focusInverse`, `onSelect`).

  ```tsx
  import {
    InkLink,
    InkRouterProvider,
    useRouteNode,
  } from "@real-router/react/ink";

  <InkRouterProvider router={router}>
    <InkLink routeName="home" focusColor="cyan" activeColor="green" autoFocus>
      Home
    </InkLink>
  </InkRouterProvider>;
  ```

  `ink` is added as an **optional** peer dependency (`peerDependenciesMeta.ink.optional = true`) — existing DOM consumers don't need to install it. The main and `/legacy` entries are unchanged.

## 0.17.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0
  - @real-router/sources@0.7.2

## 0.17.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0
  - @real-router/sources@0.7.1

## 0.17.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. The generic is erased at compile time — no runtime change. `RouteContext<P>` is likewise generic, defaulting to `Params`.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const { route } = useRoute<SearchParams>();

  route?.params.q; // typed as string — no cast needed
  route?.params.sort; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

## 0.16.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated internal hooks to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — multiple consumers now share one router subscription per router instance instead of creating fresh WeakMap caches locally. Removed duplicated `useStableValue` helper (params stabilization is now canonical inside `createActiveRouteSource`).

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: remove redundant `routeUtilsCache` WeakMap in `useRouteUtils` ([#467](https://github.com/greydragon888/real-router/issues/467))

  `getRouteUtils` from `@real-router/route-utils` is already WeakMap-cached
  per `RouteTreeNode`, so the extra per-router cache in the React adapter
  was redundant — the same `RouteUtils` instance is returned across renders
  by the internal cache. Aligns React with the 5 other adapters (Preact,
  Solid, Vue, Svelte, Angular) that rely on the shared cache directly.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## 0.16.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace JSON-based deep equality with `shallowEqual` in Link memo comparator ([#462](https://github.com/greydragon888/real-router/issues/462))

  `Link`'s `areLinkPropsEqual` previously called `stableSerialize` (JSON.stringify with sorted keys) on `routeParams` and `routeOptions` twice per comparator invocation — ~850 ns per Link per parent re-render. Replaced with `shallowEqual` (Object.is per key, order-insensitive) — ~40 ns, a ~20× speed-up on the comparator hot path.
  - `shallowEqual` exported from `@real-router/react` dom-utils barrel (via `shared/dom-utils/link-utils.ts`)
  - Correctness improvements alongside the speed-up:
    - `{id: 1n}` vs `{id: 1n}` now correctly treated as equal (`Object.is` handles BigInt)
    - `{a: undefined}` vs `{}` now correctly treated as NOT equal (previous JSON-based path treated them as equal, masking structural differences)
    - Circular references and Symbol keys no longer trigger fallback paths
  - Trade-off: nested objects/arrays in `routeParams` with equal content but different references now trigger a re-render. Stabilize via `useMemo` if needed — standard React pattern. In practice `routeParams` is almost always a flat `Record<string, primitive>`.

  No public API change; gotcha documentation in `CLAUDE.md` updated.

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/react ([#462](https://github.com/greydragon888/real-router/issues/462))
  - **Hot path:** cache `createTransitionSource` per router via `WeakMap` — `useRouterTransition` no longer recreates the source on every render/router-ref change
  - **Hot path:** cache `RouteUtils` per router via `WeakMap` in `useRouteUtils` — drops repeated `getPluginApi().getTree()` lookups on re-render
  - **Hot path:** `RouterProvider` / `useRouteNode` now keep the raw `useSyncExternalStore` snapshot as the memo dependency instead of destructuring `{ route, previousRoute }`. `stabilizeState` guarantees the snapshot identity is preserved across idempotent navigations — consumers no longer re-render when the route did not change
  - **Hot path:** `useRouteNode` drops the redundant `useMemo` wrapper around `getNavigator(router)` — `getNavigator` is already WeakMap-cached in core
  - **`<RouteView>`:** memoize the flattened `Match`/`NotFound` element list on `children` identity. Steady-state navigations skip the `Children.toArray` + `collectElements` traversal; only re-traverse when the parent re-renders with a new `children` node. `ref` is lazy-initialized to avoid per-render `new Set()` allocation
  - **`<RouteView>`:** `isSegmentMatch` now early-returns `false` for empty-string `fullSegmentName` — prevents a literal route named `""` from matching against `activeStrict=false` prefix logic
  - **`useStableValue`:** rewritten as a pure `useRef` pattern with order-insensitive recursive JSON serialization via `stableSerialize`. Gracefully falls back to identity (`Object.is`) comparison when serialization throws (BigInt, circular refs, Symbol, function). Previously threw on BigInt and treated key-order permutations as different values
  - **Stress coverage:** new suites for dynamic routes, error boundary teardown, Suspense + transition, link-mass-rendering, mount/unmount lifecycle, transition-hook stress
  - **Performance tests:** new coverage for `useIsActiveRoute`, `useNavigator`, `useRouteUtils`, `useRouter` to lock in the WeakMap/cache invariants
  - **Property tests:** shared `linkUtils.properties.ts` now exercises the real `dom-utils` exports (`shouldNavigate`, `buildActiveClassName`, etc.) instead of inline replicas
  - **Docs:** README / ARCHITECTURE / CLAUDE brought back in sync with source — gotcha table updated to reflect the new stable-snapshot behavior

  No public API change.

## 0.15.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

## 0.15.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/route-utils@0.2.0
  - @real-router/sources@0.5.0

## 0.14.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

## 0.14.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

## 0.14.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

## 0.14.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

## 0.14.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/react` failed with `ETARGET: No matching version found for dom-utils`.

## 0.14.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

## 0.14.5

### Patch Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add eslint-disable comments for intentional ref patterns ([#391](https://github.com/greydragon888/real-router/issues/391))

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

## 0.14.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

## 0.14.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

## 0.14.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

## 0.14.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

## 0.14.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New component that shows a fallback **alongside** children when a navigation error occurs (guard rejection, route not found). Auto-resets on successful navigation. Supports manual dismiss via `resetError()` and side-effect logging via `onError` callback. Available from both `@real-router/react` and `@real-router/react/legacy`.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

## 0.13.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

## 0.13.1

### Patch Changes

- Updated dependencies [[`d1ebff8`](https://github.com/greydragon888/real-router/commit/d1ebff8065cc85356a1701ba744c3b0a2d6a2669)]:
  - @real-router/core@0.39.0
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6
  - dom-utils@0.2.1

## 0.13.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```tsx
  <RouterProvider router={router} announceNavigation>
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `RouteView.Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, children are automatically wrapped in `<Suspense>`. Works with both `keepAlive` (Activity) and non-keepAlive modes.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName` moved from local `utils.ts` into shared private `dom-utils` package.

## 0.12.4

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0
  - @real-router/sources@0.2.5

## 0.12.3

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, hooks table with re-render behavior, `useNavigator` added, React 18 migration section. ARCHITECTURE: added `useRouterTransition` to codemap and subscription patterns, added performance test coverage table, removed stale Pending Changes section.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0
  - @real-router/route-utils@0.1.5
  - @real-router/sources@0.2.4

## 0.12.2

### Patch Changes

- [#305](https://github.com/greydragon888/real-router/pull/305) [`ab5d8f5`](https://github.com/greydragon888/real-router/commit/ab5d8f5b27c7901632645c53367b5e42e5e765cf) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `use()` with `useContext()` in hooks for React 18 compatibility ([#288](https://github.com/greydragon888/real-router/issues/288))

  `useRouter`, `useRoute`, and `useNavigator` used React 19's `use()` API, breaking the `@real-router/react/legacy` entry point on React 18. Replaced with `useContext()` which is available in both React 18 and 19.

## 0.12.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0
  - @real-router/sources@0.2.3

## 0.12.0

### Minor Changes

- [#299](https://github.com/greydragon888/real-router/pull/299) [`89351ba`](https://github.com/greydragon888/real-router/commit/89351ba3633087f488d30ea478c38c6de8f6b36e) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove raw Context exports from public API ([#283](https://github.com/greydragon888/real-router/issues/283))

  **Breaking Change:** `RouterContext`, `RouteContext`, and `NavigatorContext` are no longer exported from `@real-router/react` or `@real-router/react/legacy`. Use the corresponding hooks instead.

  **Migration:**

  ```diff
  - import { RouterContext } from "@real-router/react";
  - const router = useContext(RouterContext);
  + import { useRouter } from "@real-router/react";
  + const router = useRouter();
  ```

  ```diff
  - import { RouteContext } from "@real-router/react";
  - const routeState = useContext(RouteContext);
  + import { useRoute } from "@real-router/react";
  + const { route, previousRoute } = useRoute();
  ```

  ```diff
  - import { NavigatorContext } from "@real-router/react";
  - const navigator = useContext(NavigatorContext);
  + import { useNavigator } from "@real-router/react";
  + const navigator = useNavigator();
  ```

## 0.11.0

### Minor Changes

- [#281](https://github.com/greydragon888/real-router/pull/281) [`84d5831`](https://github.com/greydragon888/real-router/commit/84d5831384fccacf0f91e02d17a4f79abcaa7975) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `useIsActiveRoute` from public API ([#280](https://github.com/greydragon888/real-router/issues/280))

  **Breaking Change:** `useIsActiveRoute` is no longer exported from `@real-router/react` or `@real-router/react/legacy`. The hook remains as an internal utility used by `<Link>`.

  **Migration:**

  ```diff
  - import { useIsActiveRoute } from "@real-router/react";
  - const isActive = useIsActiveRoute("users.profile", { id });

  + import { useRouteNode } from "@real-router/react";
  + const { route } = useRouteNode("users");
  + const isActive = route?.name === "users.profile";
  ```

  Or use `<Link>` which handles active state automatically via render props.

## 0.10.0

### Minor Changes

- [#274](https://github.com/greydragon888/real-router/pull/274) [`d254b69`](https://github.com/greydragon888/real-router/commit/d254b690624e6000b9f4bd6b139309943e405ca3) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `keepAlive` prop to `<RouteView.Match>` ([#261](https://github.com/greydragon888/real-router/issues/261))

  New `keepAlive` prop on `<RouteView.Match>` uses React 19.2 `<Activity>` API to hide deactivated matches instead of unmounting them, preserving DOM and React state:

  ```tsx
  <RouteView nodeName="">
    <RouteView.Match segment="users" keepAlive>
      <UsersPage />
    </RouteView.Match>
  </RouteView>
  ```

- [#274](https://github.com/greydragon888/real-router/pull/274) [`d254b69`](https://github.com/greydragon888/real-router/commit/d254b690624e6000b9f4bd6b139309943e405ca3) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `<RouteView>` to React 19.2+ only entry point ([#261](https://github.com/greydragon888/real-router/issues/261))

  **BREAKING CHANGE:** `<RouteView>` is no longer available via `@real-router/react/legacy`.

  **Migration:** Use `useRouteNode` + conditional rendering in React 18:

  ```tsx
  const { route } = useRouteNode("");
  if (startsWithSegment(route.name, "users")) return <UsersPage />;
  ```

  Or upgrade to React 19.2+ and import from `@real-router/react`.

## 0.9.0

### Minor Changes

- [#272](https://github.com/greydragon888/real-router/pull/272) [`a54d5f9`](https://github.com/greydragon888/real-router/commit/a54d5f9907dea7025af41eff21d1dde6d42ecf29) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `<RouteView>` declarative routing component ([#260](https://github.com/greydragon888/real-router/issues/260))

  Declarative compound component for view-level routing. Replaces imperative if/switch patterns with JSX:

  ```tsx
  <RouteView nodeName="">
    <RouteView.Match segment="users">
      <UsersPage />
    </RouteView.Match>
    <RouteView.Match segment="settings">
      <SettingsPage />
    </RouteView.Match>
    <RouteView.NotFound>
      <NotFoundPage />
    </RouteView.NotFound>
  </RouteView>
  ```

## 0.8.0

### Minor Changes

- [#268](https://github.com/greydragon888/real-router/pull/268) [`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouterTransition` hook ([#259](https://github.com/greydragon888/real-router/issues/259))

  New hook for tracking router transition state. Returns `RouterTransitionSnapshot`
  with `isTransitioning`, `toRoute`, and `fromRoute`. Useful for progress bars,
  loading overlays, and disabling navigation during async guards.

  Available in both entry points (`@real-router/react` and `@real-router/react/legacy`).

### Patch Changes

- Updated dependencies [[`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358)]:
  - @real-router/sources@0.2.0

## 0.7.0

### Minor Changes

- [#266](https://github.com/greydragon888/real-router/pull/266) [`9c759cb`](https://github.com/greydragon888/real-router/commit/9c759cbafb1334e10d4987bf48b0fb3165dafb73) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Consolidate Link components — remove `BaseLink` and `ConnectedLink` ([#258](https://github.com/greydragon888/real-router/issues/258))
  - `Link` now subscribes to active state via `useIsActiveRoute` — re-renders only when its own active status changes
  - `BaseLink` removed — `Link` takes router from context automatically
  - `ConnectedLink` removed — `Link` provides the same granular reactivity with less overhead
  - `BaseLinkProps` type replaced by `LinkProps<P>`
  - Removed: `data-route` and `data-active` HTML attributes
  - Fix: `routeOptions` (reload, replace) now correctly passed to navigation (previously silently dropped by `Link` and `ConnectedLink`)

## 0.6.0

### Minor Changes

- [#263](https://github.com/greydragon888/real-router/pull/263) [`7cdb227`](https://github.com/greydragon888/real-router/commit/7cdb2271f765a1839efc3e1fe6f1a20301ded408) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `./legacy` subpath export for React 18+ compatibility ([#257](https://github.com/greydragon888/real-router/issues/257))

  **BREAKING:** Main entry point (`@real-router/react`) now targets React 19.2+. React 18 users must switch to the legacy entry.

  **Migration:**

  ```diff
  - import { RouterProvider, useRouteNode, Link } from '@real-router/react';
  + import { RouterProvider, useRouteNode, Link } from '@real-router/react/legacy';
  ```

  Both entry points share the same code and export the same API. The `/legacy` entry excludes future React 19.2-only components (e.g., `ActivityRouteNode`).

## 0.5.5

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0
  - @real-router/sources@0.1.4
  - @real-router/route-utils@0.1.4

## 0.5.4

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0
  - @real-router/sources@0.1.3
  - @real-router/route-utils@0.1.3

## 0.5.3

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0
  - @real-router/sources@0.1.2
  - @real-router/route-utils@0.1.2

## 0.5.2

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0
  - @real-router/sources@0.1.1
  - @real-router/route-utils@0.1.1

## 0.5.1

### Patch Changes

- [#218](https://github.com/greydragon888/real-router/pull/218) [`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor React hooks to use `@real-router/sources` (#217)

  Internal refactoring: `useRouteNode`, `useIsActiveRoute`, and `RouterProvider` now delegate
  subscription logic to `@real-router/sources`. No public API changes.

- Updated dependencies [[`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8)]:
  - @real-router/sources@0.1.0

## 0.5.0

### Minor Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteUtils()` hook (#214)

  New hook providing direct access to `RouteUtils` instance without manual initialization:

  ```typescript
  import { useRouteUtils } from "@real-router/react";

  function Breadcrumbs() {
    const utils = useRouteUtils();
    const chain = utils.getChain(route.name);
    // ...
  }
  ```

  Internally calls `getRouteUtils(getPluginApi(router).getTree())` — returns a cached, pre-computed instance.

### Patch Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate `areRoutesRelated` import from `@real-router/helpers` to `@real-router/route-utils` (#214)

  Internal dependency change — no API changes for consumers.

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0
  - @real-router/route-utils@0.1.0

## 0.4.12

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0
  - @real-router/helpers@0.1.34

## 0.4.11

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0
  - @real-router/helpers@0.1.33

## 0.4.10

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0
  - @real-router/helpers@0.1.32

## 0.4.9

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0
  - @real-router/helpers@0.1.31

## 0.4.8

### Patch Changes

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0
  - @real-router/helpers@0.1.30

## 0.4.7

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0
  - @real-router/helpers@0.1.28

## 0.4.6

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0
  - @real-router/helpers@0.1.27

## 0.4.5

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0
  - @real-router/helpers@0.1.26

## 0.4.4

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/browser-plugin@0.4.0
  - @real-router/core@0.22.0
  - @real-router/helpers@0.1.25

## 0.4.3

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0
  - @real-router/browser-plugin@0.3.3
  - @real-router/helpers@0.1.24

## 0.4.2

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0
  - @real-router/browser-plugin@0.3.2
  - @real-router/helpers@0.1.23

## 0.4.1

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0
  - @real-router/browser-plugin@0.3.1
  - @real-router/helpers@0.1.22

## 0.4.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(react)!: remove callback props from BaseLink (#45)

  **Breaking Change:** `successCallback` and `errorCallback` props removed from `BaseLink`/`Link`/`ConnectedLink`.

  ```typescript
  // Before
  <Link routeName="users" successCallback={(state) => ...} errorCallback={(err) => ...} />

  // After
  <Link routeName="users" />
  ```

  Use `router.addEventListener(events.TRANSITION_SUCCESS, ...)` for navigation tracking.

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5), [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/browser-plugin@0.2.0
  - @real-router/core@0.17.0
  - @real-router/helpers@0.1.20

## 0.3.1

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0
  - @real-router/browser-plugin@0.1.19
  - @real-router/helpers@0.1.19

## 0.3.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Update to use standalone `getNavigator` function (#83)

  Update to use standalone `getNavigator` function. Fix `useRouteNode` navigator memoization bug.

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0
  - @real-router/browser-plugin@0.1.18
  - @real-router/helpers@0.1.18

## 0.2.8

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0
  - @real-router/browser-plugin@0.1.17
  - @real-router/helpers@0.1.17

## 0.2.7

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0
  - @real-router/browser-plugin@0.1.16
  - @real-router/helpers@0.1.16

## 0.2.6

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0
  - @real-router/browser-plugin@0.1.15
  - @real-router/helpers@0.1.15

## 0.2.5

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0
  - @real-router/browser-plugin@0.1.14
  - @real-router/helpers@0.1.14

## 0.2.4

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0
  - @real-router/browser-plugin@0.1.13
  - @real-router/helpers@0.1.13

## 0.2.3

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0
  - @real-router/browser-plugin@0.1.12
  - @real-router/helpers@0.1.12

## 0.2.2

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0
  - @real-router/browser-plugin@0.1.11
  - @real-router/helpers@0.1.11

## 0.2.1

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0
  - @real-router/browser-plugin@0.1.10
  - @real-router/helpers@0.1.10

## 0.2.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useNavigator()` hook and update React bindings (#37)

  **New:**
  - `useNavigator()` hook for direct Navigator access
  - `NavigatorContext` for providing Navigator to components

  **BREAKING CHANGE:**
  - `useRoute()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`
  - `useRouteNode()` now returns `{ navigator, route, previousRoute }` instead of `{ router, ... }`

  **Migration:**

  ```tsx
  // Before
  const { router, route } = useRoute();
  router.navigate("home");

  // After
  const { navigator, route } = useRoute();
  navigator.navigate("home");

  // For full Router access:
  const router = useRouter();
  ```

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0
  - @real-router/browser-plugin@0.1.9
  - @real-router/helpers@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0
  - @real-router/browser-plugin@0.1.8
  - @real-router/helpers@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies [[`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777), [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/browser-plugin@0.1.7
  - @real-router/core@0.4.0
  - @real-router/helpers@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0
  - @real-router/browser-plugin@0.1.6
  - @real-router/helpers@0.1.6

## 0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4
  - @real-router/browser-plugin@0.1.5
  - @real-router/helpers@0.1.5

## 0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3
  - @real-router/browser-plugin@0.1.4
  - @real-router/helpers@0.1.4

## 0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/browser-plugin@0.1.3
  - @real-router/helpers@0.1.3

## 0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1
  - @real-router/browser-plugin@0.1.2
  - @real-router/helpers@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0
  - @real-router/browser-plugin@0.1.1
  - @real-router/helpers@0.1.1

## 0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0
