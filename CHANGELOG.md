# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2026-04-19]

### @real-router/core@0.48.1

### Patch Changes

- [#481](https://github.com/greydragon888/real-router/pull/481) [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f) Thanks [@greydragon888](https://github.com/greydragon888)! - Document the public `params` contract in README ([#465](https://github.com/greydragon888/real-router/issues/465))

  Added explicit documentation of how `navigate()` and `buildPath()` handle each value type in `params`:
  - `undefined` → stripped (documented contract, not implementation detail)
  - `null` → `?key` (key-only)
  - `""` → `?key=` (explicit empty value, distinct from `null`)
  - Falsy-but-defined values (`0`, `false`, `""`) preserved
  - Number and boolean auto-coercion on parse

  Tables for input (`params` object) and output (URL → `state.params`) semantics.

  Cross-references to `search-params` and `search-schema-plugin` README for configuration and schema integration.

- [#481](https://github.com/greydragon888/real-router/pull/481) [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f) Thanks [@greydragon888](https://github.com/greydragon888)! - Lock `undefined` params contract at core boundary ([#465](https://github.com/greydragon888/real-router/issues/465))

  `router.navigate(name, { x: undefined })` and `router.buildPath(name, { x: undefined })` are now guaranteed to produce URLs without `x` **by core itself**, not transitively through the query-string engine. Plugin interceptors that introduce `undefined` values into `forwardState` output are also normalized away before they reach URL and `state.params`.

  **Behavior change:** `state.params` no longer contains keys whose values are `undefined` after navigation — `"x" in state.params` is `false`, not `true` with `state.params.x === undefined`. The serialized URL is unchanged; only the in-memory `state.params` shape is tightened.

  **Internal:** `defaultQueryString` fallback removed from `path-matcher` (dead code, internal package). `SegmentMatcher` now requires `parseQueryString`/`buildQueryString` as mandatory options; `search-params` remains the only engine used by the public API.

  Groundwork for the query-param semantics contract defined in the RFC (`packages/core/.claude/rfc/rfc-query-param-semantics.md`).

### @real-router/search-schema-plugin@0.2.2

### Patch Changes

- [#481](https://github.com/greydragon888/real-router/pull/481) [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f) Thanks [@greydragon888](https://github.com/greydragon888)! - Document schema ↔ format coercion in README ([#465](https://github.com/greydragon888/real-router/issues/465))

  Added "Schema ↔ Format Coercion" section explaining:
  - The plugin validates decoded (typed) values, not raw URL strings
  - How `queryParams` options (booleanFormat, numberFormat, arrayFormat) interact with schema types
  - Gotcha: `z.boolean()` with `booleanFormat: "none"` breaks because schema receives strings
  - Workaround: `z.coerce.boolean()` / `z.coerce.number()` for mismatched configs
  - Recommended baseline: keep `queryParams` defaults for typical Zod/Valibot schemas

  Cross-reference to `@real-router/core` Params Contract section.

- Updated dependencies [[`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f), [`39697e4`](https://github.com/greydragon888/real-router/commit/39697e4128614605ee7dcd81a34e48cb62bb4c4f)]:
  - @real-router/core@0.48.1

## [2026-04-18]

### @real-router/angular@0.2.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `injectRoute<P>()` / `RouteSignals<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `injectRoute<P>()` now accepts an optional generic so `routeState().route?.params` is typed without `as` casts. `RouteSignals<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the function.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const route = injectRoute<SearchParams>();
  const q = route.routeState().route?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

### @real-router/preact@0.5.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. The generic is erased at compile time — no runtime change. `RouteContext<P>` is likewise generic, defaulting to `Params`.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const { route } = useRoute<SearchParams>();

  route?.params.q; // typed as string — no cast needed
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

### @real-router/react@0.17.0

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

### @real-router/solid@0.5.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.params` is typed without `as` casts at the call site. Returns `Accessor<RouteState<P>>`. The generic is erased at compile time — no runtime change.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const routeState = useRoute<SearchParams>();
  const q = routeState().route?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

### @real-router/sources@0.7.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add optional generic parameter to `RouteSnapshot<P>` / `RouteNodeSnapshot<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  Both snapshot types now accept an optional generic for typed `route.params`, defaulting to `Params` for full backward compatibility. Enables adapter-level propagation in `injectRoute<P>()` and similar hooks without a framework-specific snapshot shape.

### @real-router/svelte@0.4.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.current?.params` is typed without `as` casts. `RouteContext<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the composable.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const { route } = useRoute<SearchParams>();
  const q = route.current?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0

### @real-router/vue@0.6.0

### Minor Changes

- [#479](https://github.com/greydragon888/real-router/pull/479) [`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39) Thanks [@greydragon888](https://github.com/greydragon888)! - Add generic type parameter to `useRoute<P>()` / `RouteContext<P>` ([#464](https://github.com/greydragon888/real-router/issues/464))

  `useRoute<P>()` now accepts an optional generic so `route.value?.params` is typed without `as` casts. `RouteContext<P>` is likewise generic, defaulting to `Params`. Runtime is unchanged — the cast happens once inside the composable.

  ```typescript
  type SearchParams = { q: string; sort: string } & Params;

  const { route } = useRoute<SearchParams>();
  const q = route.value?.params.q; // typed as string
  ```

### Patch Changes

- Updated dependencies [[`1107380`](https://github.com/greydragon888/real-router/commit/11073804666e724008847c6b34b20b445f1d6f39)]:
  - @real-router/sources@0.7.0


### @real-router/lifecycle-plugin@0.4.0

### Minor Changes

- [#476](https://github.com/greydragon888/real-router/pull/476) [`486bab8`](https://github.com/greydragon888/real-router/commit/486bab878f41ad8eba95588fdd38606f141e649c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `onNavigate` lifecycle hook — orthogonal to `onEnter` / `onStay` ([#463](https://github.com/greydragon888/real-router/issues/463))

  New route-level hook that fires on every successful navigation to the route,
  regardless of whether the route was entered or params changed. Replaces the
  common pattern of duplicating the same function in both `onEnter` and `onStay`.

  ```typescript
  // Before — duplication:
  {
    name: "services.catalog",
    path: "/catalog?q&sort&dir",
    onEnter: loadServices,
    onStay: loadServices,
  }

  // After — one declaration:
  {
    name: "services.catalog",
    path: "/catalog?q&sort&dir",
    onNavigate: loadServices,
  }
  ```

  **Orthogonal dispatch:** `onEnter` / `onStay` / `onNavigate` fire
  independently — if both `onEnter` and `onNavigate` are defined, both fire on
  entry. Each hook reacts to its own condition, so you can compose shared logic
  (`onNavigate`) with case-specific setup (`onEnter` / `onStay`) without either
  silencing the other.


### @real-router/sources@0.6.0

### Minor Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - feat: add `createActiveNameSelector(router)` — per-router cached O(1) active-name checker ([#467](https://github.com/greydragon888/real-router/issues/467))

  One shared `router.subscribe` handle across any number of distinct route-name consumers (vs one subscription per name via `createActiveRouteSource`). Framework adapters can adopt this for `Link` fast-paths when params/strict/ignoreQueryParams are at defaults. Based on the `routeSelector` pattern from `@real-router/solid`, now available framework-agnostic.

  API: `{ subscribe(routeName, listener), isActive(routeName), destroy }`. New `ActiveNameSelector` type exported.

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - feat: per-router caching for all sources + helpers for adapters ([#467](https://github.com/greydragon888/real-router/issues/467))
  - `getErrorSource(router)` and `getTransitionSource(router)` — cached factories for shared eager sources. Multiple consumers (mount/unmount cycles) reuse one instance; external `destroy()` is a no-op on the cached wrapper, so adapters with eager teardown (Angular `sourceToSignal`) are safe by default.
  - `createRouteNodeSource(router, nodeName)` now caches per `(router, nodeName)` pair — N consumers of the same node share one router subscription instead of creating N.
  - `createActiveRouteSource(router, name, params?, options?)` now caches per `(router, name, canonicalJson(params), options)`. Key-order-insensitive (`{ a:1, b:2 }` and `{ b:2, a:1 }` hit the same entry). `Symbol`/`BigInt` params fall back to creating a fresh uncached source.
  - New exports: `DEFAULT_ACTIVE_OPTIONS`, `normalizeActiveOptions(opts?)`, `canonicalJson(value)`.
  - Removed internal `shouldUpdateCache` helper — `createRouteNodeSource` now caches the `shouldUpdateNode` closure itself as part of the source cache.

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - feat: add `createDismissableError(router)` — per-router cached source wrapping `getErrorSource` with integrated dismissed-version state ([#467](https://github.com/greydragon888/real-router/issues/467))

  Consolidates the `dismissedVersion`/`visibleError`/`resetError` pattern that was duplicated across all 6 `RouterErrorBoundary` adapters. Snapshot shape: `{ error, toRoute, fromRoute, version, resetError }`. `destroy()` is a no-op (cached wrapper). New `DismissableErrorSnapshot` type exported.

### @real-router/angular@0.1.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `injectRouterTransition` / `RouterErrorBoundary` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated `injectRouterTransition` and `RouterErrorBoundary` to `getTransitionSource` / `getErrorSource` from `@real-router/sources`. The cached shared wrapper ignores external `destroy()` — safe alongside `sourceToSignal.destroy()` that runs in `DestroyRef.onDestroy`.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

### @real-router/preact@0.4.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated internal hooks to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — `useRouterTransition` previously created a fresh eager-source per mount (no WeakMap cache), leaking a router subscription on every unmount. Also removed duplicated `useStableValue` helper — params stabilization is now canonical inside `createActiveRouteSource`.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

### @real-router/react@0.16.1

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

### @real-router/solid@0.4.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: unified node/active source caches moved to `@real-router/sources` ([#467](https://github.com/greydragon888/real-router/issues/467))
  - Migrated `useRouterError`/`useRouterTransition` to `getErrorSource` / `getTransitionSource` — removed local WeakMap caches.
  - Removed local `sharedNodeSource` helper — `createRouteNodeSource` in `@real-router/sources` now caches per `(router, nodeName)` natively.
  - Removed `Link` slow-path `activeSourceCache` + `getOrCreateActiveSource` — `createActiveRouteSource` now caches per `(router, name, params, options)` natively.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

### @real-router/svelte@0.3.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated internal composables to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — `useRouterTransition` previously created a fresh eager-source per mount (no WeakMap cache), leaking a router subscription on every unmount. Multiple consumers now share one router subscription.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

### @real-router/vue@0.5.1

### Patch Changes

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - refactor: RouterErrorBoundary uses shared `createDismissableError` from `@real-router/sources` — removes local `dismissedVersion` state duplication ([#467](https://github.com/greydragon888/real-router/issues/467))

- [#474](https://github.com/greydragon888/real-router/pull/474) [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: memory leak in `useRouterTransition`/`useRouterError` via shared cached source ([#467](https://github.com/greydragon888/real-router/issues/467))

  Migrated internal composables to `getTransitionSource` / `getErrorSource` from `@real-router/sources` — `useRouterTransition` previously created a fresh eager-source per mount (no WeakMap cache), leaking a router subscription on every unmount. Multiple consumers now share one router subscription.

- Updated dependencies [[`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3), [`d6c1b39`](https://github.com/greydragon888/real-router/commit/d6c1b39e7c2b6c427be062b13ba3eb633eadc7c3)]:
  - @real-router/sources@0.6.0

## [2026-04-17]

### @real-router/browser-plugin@0.13.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix URL helpers and harden options validation ([#470](https://github.com/greydragon888/real-router/issues/470))

  **URL helpers (from shared `browser-env`)**
  - `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere.
  - `extractPath` now guarantees a leading slash in the no-match branch (`extractPath("users", "/app")` → `"/users"`, previously `"users"`).
  - `buildUrl` inserts the `/` separator when the path doesn't already start with one.

  **Plugin behavior**
  - `replaceHistoryState` now preserves `location.hash` — symmetric with `onTransitionSuccess`.
  - `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
  - Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.

  **Internal / performance**
  - `onTransitionSuccess` now composes the URL via `buildUrl(toState.path, base)` instead of the `router.buildUrl` dispatch — saves one method lookup per navigation. Tests that spied on `router.buildUrl` inside `onTransitionSuccess` must now spy on the browser-env `buildUrl` instead.
  - `BrowserContext` payloads are frozen once at module load (`FROZEN_POPSTATE`, `FROZEN_NAVIGATE`) and reused per transition instead of being recreated and frozen on every write.
  - The hash-preservation branch skips the `url + ""` concatenation when the hash is empty.
  - Internal constant `source` renamed to `POPSTATE_SOURCE` — no public API impact.

  **Breaking (pre-1.0):**
  - `extractPath("", base)` returns `"/"` instead of `""`. In practice this only affects custom callers — production code always passes `url.pathname`, which starts with `/`.
  - `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
  - `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.

### @real-router/hash-plugin@0.4.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix URL helpers and harden options validation ([#470](https://github.com/greydragon888/real-router/issues/470))

  **Base path normalization (from shared `browser-env`)**
  - `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere. Affects hash-plugin because the factory passes `base` through `normalizeBase`.

  **Plugin behavior**
  - `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
  - `hashPrefix` option is now validated against `/`, `#`, `?`, and control characters (via the new shared `safeHashPrefixRule`). Previously `hashPrefix: "/"` silently produced `#//path` URLs and broke `matchPath` on `getLocation()` because `extractHashPath` stripped the leading `/`.
  - `matchUrl` no longer concatenates the outer query (`?a=1` before `#`) with the inner hash query — inner wins. Previously `matchUrl("example.com/?a=1#/users?page=2")` produced the malformed path `/users?page=2?a=1`. Same fix applied to the default `getLocation` closure the factory builds.
  - Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.
  - `replaceHistoryState` explicitly opts out of the new shared hash-preservation behavior (passes `preserveHash: false`) — hash already encodes the route.

  **Breaking (pre-1.0):**
  - `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
  - `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.
  - `hashPrefix: "/"`, `"#"`, `"?"`, or values with control characters now throw at factory time.

### @real-router/navigation-plugin@0.3.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix URL helpers and harden options validation ([#470](https://github.com/greydragon888/real-router/issues/470))

  **URL helpers (from shared `browser-env`)**
  - `normalizeBase` now collapses any run of slashes to a single `/` (previously `"/app//"` → `"/app/"`, `"//"` → `"/"`). Result is canonical: empty or starts with `/`, no trailing `/`, no `//` anywhere.
  - `extractPath` now guarantees a leading slash in the no-match branch.
  - `buildUrl` inserts the `/` separator when the path doesn't already start with one.
  - New `extractPathFromAbsoluteUrl(url, base, context)` helper — alias of `urlToPath` with explicit defensive semantics. Used in `entryToState` and the entry URL path to swallow malformed Navigation API URLs as `null` instead of throwing.

  **Plugin behavior**
  - Entry URL parsing (`entryToState`, `#buildEntryUrl`) now uses the defensive `extractPathFromAbsoluteUrl`. Malformed entry URLs (e.g., from mocks, extensions, or non-spec sources) no longer throw from the Navigation API event handler — they resolve to `undefined` / trigger the "no matching route" branch.
  - `browser.navigate(url, options)` now forwards the full `options` object to `nav.navigate` instead of picking only `state` and `history`. Lets callers pass `info`, `downloadRequest`, and any future Navigation API options transparently.
  - `replaceHistoryState` now preserves `location.hash` — symmetric with `onTransitionSuccess`.
  - `base` option is now validated against control characters and `..` segments (via the shared `safeBaseRule`).
  - Dropped the unused third `title?: string` parameter from `replaceHistoryState` type augmentation.
  - `shouldReplaceHistory` behavior for `{ replace: false, fromState: undefined }` is now confirmed as `false` (explicit user override). The invariant G4 description was rewritten — it no longer claims the function throws.

  **Internal / performance**
  - `onTransitionSuccess` now composes the URL via `buildUrl(toState.path, base)` instead of `router.buildUrl` dispatch — saves one method lookup per navigation. Tests spying on `router.buildUrl` inside `onTransitionSuccess` must spy on the browser-env `buildUrl` instead.
  - The hash-preservation branch skips the `url + ""` concatenation when the hash is empty.
  - Extracted `withRecovery(run)` helper in `navigate-handler.ts` — dedupes the two `try { await ... } catch { recoverFromNavigateError }` blocks.

  **Breaking (pre-1.0):**
  - `replaceHistoryState(name, params, title)` no longer type-checks — drop the third argument.
  - `base: "../evil"` and `base: "/app\nX"` now throw at factory time instead of silently passing through.

### @real-router/memory-plugin@0.3.0

### Minor Changes

- [#472](https://github.com/greydragon888/real-router/pull/472) [`a550f40`](https://github.com/greydragon888/real-router/commit/a550f4011ce499a1a56706a89e588652747cd944) Thanks [@greydragon888](https://github.com/greydragon888)! - Harden input validation and teardown ([#470](https://github.com/greydragon888/real-router/issues/470))

  **Input validation**
  - `memoryPluginFactory({ maxHistoryLength: NaN })`, `Infinity`, or `0.5` now throw at factory time. Previously these slipped through the `typeof === "number"` check and caused subtle history corruption at runtime.
  - `router.go(delta)` now silently returns when `delta` is `NaN`, `Infinity`, or a non-integer (in addition to the existing `delta === 0` short-circuit). Previously non-finite deltas propagated into the history index and produced stuck or out-of-range state.

  **Teardown**
  - `teardown()` is now idempotent via a `#disposed` flag. Double-dispose scenarios (e.g., `router.dispose()` after user-level `unsubscribe()`, or vice versa) no longer double-release the context namespace claim.

  **Internal**
  - Extracted `#writeMemoryContext(toState, direction)` helper — dedupes the two `claim.write(...)` sites in `onTransitionSuccess`.
  - `this.#entries.splice(this.#index + 1)` replaced with `this.#entries.length = this.#index + 1` for cheaper truncation on every forward navigation that invalidates the future.


### @real-router/angular@0.1.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial Angular 21 adapter for Real-Router ([#462](https://github.com/greydragon888/real-router/issues/462))

  New package `@real-router/angular` — signal-based, zoneless-compatible bindings for Angular 21+. Built with ng-packagr (partial Ivy compilation, FESM2022 ESM-only output).

  **Public API:**
  - `provideRealRouter(router)` — environment providers for DI
  - Injection tokens: `ROUTER`, `NAVIGATOR`, `ROUTE`
  - `inject*` functions: `injectRouter`, `injectNavigator`, `injectRoute`, `injectRouteNode`, `injectRouteUtils`, `injectRouterTransition`, `injectIsActiveRoute`
  - Components: `RouteView`, `RouterErrorBoundary`, `NavigationAnnouncer`
  - Directives: `RouteMatch`, `RouteNotFound`, `RealLink`, `RealLinkActive`
  - `sourceToSignal(source)` — bridge for RouterSource to Angular Signal

  **Features:**
  - Signal-first reactive state via `sourceToSignal` (no RxJS dependency)
  - Declarative route matching with `<route-view>` + `ng-template routeMatch="..."` / `ng-template routeNotFound`
  - WCAG-compliant navigation announcements via `NavigationAnnouncer` component
  - Link shipped with `shallowEqual`-based props equality from day 1 (same hot-path optimization as the other adapters)
  - Shared `dom-utils` (link utilities, route announcer) materialized from `shared/dom-utils/` via `prebundle` script — ng-packagr does not follow symlinks the same way tsdown does

  **Coverage threshold 94/84/94/94 (statements/branches/functions/lines)** — JIT TestBed does not bind signal `input()` in templates, so directive callbacks and `contentChildren` paths are unreachable without AOT. See `packages/angular/CLAUDE.md` for the full list of lines excluded from JIT coverage.

  **Peer dependencies:** `@angular/core >= 21.0.0`, `@angular/common >= 21.0.0`.

### @real-router/preact@0.4.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace JSON-based deep equality with `shallowEqual` in Link memo comparator ([#462](https://github.com/greydragon888/real-router/issues/462))

  `Link`'s `areLinkPropsEqual` previously called `JSON.stringify` on `routeParams` and `routeOptions` twice per comparator invocation. Replaced with `shallowEqual` (Object.is per key, order-insensitive) — ~20× speed-up on the comparator hot path.
  - `shallowEqual` exported from `@real-router/preact` dom-utils barrel (via `shared/dom-utils/link-utils.ts`)
  - `Link.tsx` additionally drops `useStableValue` for `routeParams`/`routeOptions` — the memo bail-out already catches stable references, so the extra serialization per render was redundant
  - Correctness improvements:
    - `{id: 1n}` vs `{id: 1n}` now correctly treated as equal (`Object.is` handles BigInt)
    - `{a: undefined}` vs `{}` now correctly treated as NOT equal
    - Circular references and Symbol keys no longer trigger fallback paths
  - Trade-off: nested objects/arrays in `routeParams` with equal content but different references now trigger a re-render. Stabilize via `useMemo` if needed — standard Preact pattern. In practice `routeParams` is almost always a flat `Record<string, primitive>`.

  No public API change; gotcha documentation in `CLAUDE.md` updated.

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/preact ([#462](https://github.com/greydragon888/real-router/issues/462))
  - **Hot path:** `useSyncExternalStore` now bails out on referentially-stable snapshots via `Object.is` inside the setter — prevents redundant re-renders when the upstream source emits the same snapshot (idempotent navigations, out-of-node updates)
  - **`<RouteView>`:** memoize the flattened `Match`/`NotFound` element list on `children` identity. Steady-state navigations skip the `collectElements` traversal; only re-traverse when the parent re-renders with a new `children` node
  - **`<RouteView>`:** `isSegmentMatch` now early-returns `false` for empty-string `fullSegmentName` — prevents a literal route named `""` from matching against `activeStrict=false` prefix logic
  - **`useStableValue`:** rewritten as a pure `useRef` pattern with order-insensitive recursive JSON serialization via `stableSerialize`. Gracefully falls back to identity (`Object.is`) comparison when serialization throws (BigInt, circular refs, Symbol, function). Previously threw on BigInt and treated key-order permutations as different values
  - **Stress coverage:** new suites for factory reuse across router instances, `replaceHistoryState` during active transitions, route deletion mid-session, mount/unmount lifecycle, subscription fan-out, and transition-hook stress
  - **Property tests:** shared `routeView.properties.ts` updated to exercise the real helpers; `link.properties.ts` uses the production `shouldNavigate`/`buildHref`/`buildActiveClassName` exports instead of inline replicas
  - **Docs:** README / ARCHITECTURE / CLAUDE brought back in sync with source

  No public API change.

### @real-router/react@0.16.0

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

### @real-router/solid@0.4.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/solid ([#462](https://github.com/greydragon888/real-router/issues/462))
  - Share the `createRouteNodeSource` WeakMap cache between `useRouteNode` and `useRouteNodeStore` via a new internal `sharedNodeSource` helper.
  - Export internal `isRouteActive` / `isSegmentMatch` helpers so property-based tests exercise the production functions instead of inline replicas.
  - Replace the inline IIFE in `<RouterErrorBoundary>` with a `<Show>` boundary.
  - Drop redundant `String(...)` wrappers from the Link slow-path cache key (no behavioral change).
  - Document the `createRouteAnnouncer` options, Safari-ready delay, and the full `RouterContext` shape (`{ router, navigator, routeSelector }`) in CLAUDE.md and the Wiki integration guide.
  - Expand test coverage: gotcha [#2](https://github.com/greydragon888/real-router/issues/2) (Never Destructure Props), gotcha [#9](https://github.com/greydragon888/real-router/issues/9) (No keepAlive disposal), every click modifier for `shouldNavigate`, Navigator surface (`subscribeLeave`, `isLeaveApproved`), `RouterErrorBoundary` `onError` reassignment, and a new 10 000-navigation long-lived subscription stress test (L1).
  - **Security fix**: `RouteView.Match` / `RouteView.NotFound` markers now use local `Symbol()` instead of `Symbol.for()`. The global-registry Symbol was spoofable — any object with `$$type: Symbol.for("RouteView.Match")` would pass the marker check inside `RouteView`. Added regression tests rejecting spoofed markers.
  - Gotcha-coverage negative tests: `activeStrict=true` ancestor rejection ([#10](https://github.com/greydragon888/real-router/issues/10)), `useFastPath` decision frozen at init ([#13](https://github.com/greydragon888/real-router/issues/13)).
  - `buildActiveClassName` in `shared/dom-utils/link-utils.ts` now deduplicates tokens via a shared `parseTokens` helper; new dedupe/merge tests in `packages/dom-utils`.
  - New stress tests: `RouteView` lazy-component switching with Suspense, Link modifier-keys under load, async-guards race (fast navigate during slow guard), `replaceHistoryState` during an active transition, and `getRoutesApi.remove()` mid-session with mounted Links (including 50-link burst removal).
  - Fix Wiki examples: `use:link` directive value must be an accessor function (`() => ({ ... })`), not an options object — documented behavior clarified in `Solid-Integration.md`.

### @real-router/svelte@0.3.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/svelte ([#462](https://github.com/greydragon888/real-router/issues/462))
  - **Hot path:** introduce `src/constants.ts` (`EMPTY_PARAMS`, `EMPTY_OPTIONS`) and use them as defaults in `<Link>` and `createLinkAction` to remove per-render / per-click `{}` allocations
  - **Hot path:** extract `createRouteContext` helper used by `RouterProvider` and `useRouteNode` — eliminates the per-access object allocation of the previous double-getter pattern; each consumer now gets a stable `route` / `previousRoute` view
  - **`<Lazy>`:** validate that `loader()` resolves to an object with a `default` export — silent empty renders are replaced with a clear error message; non-Error rejections are wrapped into `Error` instances; status modeled as a discriminated union
  - **`createLinkAction`:** honor `target="_blank"` on anchor elements (consistent with `<Link>`); deduplicate the navigate path between click and Enter handlers; remove `eslint-disable @typescript-eslint/no-non-null-assertion` via locally-narrowed `router`
  - **`<RouteView>`:** the snippet name `notFound` is now strictly reserved for the `UNKNOWN_ROUTE` fallback — even a literal route named `notFound` will not pick the snippet as a regular segment match. Hoisted `getActiveSegment` to module scope as a pure function with `for…in` iteration and pre-computed segment prefix
  - **`<RouterErrorBoundary>`:** `onError` callbacks that throw are now caught, logged via `console.error`, and never break downstream reactivity
  - **Tests:** ~24 assertion-quality fixes across functional tests; new negative test for gotcha "previousRoute is global"; new `getActiveSegment` unit tests covering the `notFound` collision; property tests now exercise the real `dom-utils` exports instead of inline replicas
  - **Stress:** +9 stress tests in 4 new files — `lazy-loading.stress.ts`, `error-boundary.stress.ts`, `teardown-race.stress.ts`, `long-run-leak.stress.ts` (38 stress tests in 12 files total)
  - **Docs:** README/CLAUDE/ARCHITECTURE/wiki brought back in sync with the source: `RouterErrorBoundary` listed in every API table; `onError` signature documented as `(error, toRoute, fromRoute)`; example count corrected (16 examples); ARCHITECTURE.md source structure no longer references non-existent files

### @real-router/vue@0.5.0

### Minor Changes

- [#468](https://github.com/greydragon888/real-router/pull/468) [`5dddc5c`](https://github.com/greydragon888/real-router/commit/5dddc5c364efa265124c217c60a04b860f8d716b) Thanks [@greydragon888](https://github.com/greydragon888)! - Audit-driven hardening of @real-router/vue ([#462](https://github.com/greydragon888/real-router/issues/462))
  - **Nested `<RouterProvider>`:** the `v-link` directive now uses a router stack (LIFO) instead of a single `_router` global. Inner providers push on mount and release on unmount, restoring the outer router for `v-link` instances still mounted in the parent scope. Previously, nested providers left the directive pointing at a torn-down router. New `pushDirectiveRouter(router): () => void` is the preferred API; `setDirectiveRouter(...)` is kept for tests and replaces the top of the stack
  - **`<RouterProvider>` `announceNavigation`:** now reactive. Toggling the prop at runtime creates/destroys the announcer accordingly. Previously the prop was read only inside `onMounted`, so post-mount toggles silently no-op'd
  - **`<Link>`:** set `inheritAttrs: false` and manually invoke `attrs.onClick` inside `handleClick`. Vue's compiled templates pass multiple `@click` handlers as an _array_; the previous implementation only invoked function values and silently dropped array cases, leading to double-invocation when attrs fall-through combined with the explicit `onClick`. Arrays are iterated and the loop exits early on `preventDefault()`
  - **`<Link>`:** `isActive` now drives a local `shallowRef` backed by `createActiveRouteSource` with `flush: "sync"`. Resubscription happens only when `routeName` / `routeParams` / `activeStrict` / `ignoreQueryParams` actually change — the prior `useIsActiveRoute` composable resubscribed on any reactive read inside the source factory
  - **`v-link` directive:** validates the binding value before attaching handlers. Missing `value` or missing `name: string` logs a descriptive error and skips wiring — prevents crashes inside click/keydown handlers. Single `handlers` WeakMap replaces two parallel click/keydown maps
  - **`<RouteView>`:** cache per-Match `keepAlive` detection by slot output identity. Steady-state navigations skip the O(n) `elements.some(...)` scan when the parent has not re-rendered the default slot
  - **`useRouteNode`:** derive `route`/`previousRoute` as `computed` over the source snapshot instead of mirroring through two `shallowRef`s with a sync `watch`. Consumers now see a stable reference when the underlying source emits the same snapshot (idempotent or out-of-node navigation)
  - **`RouteContext` types:** `route` / `previousRoute` are now typed as `Readonly<Ref<State | undefined>>` instead of `ShallowRef<State | undefined>`. `useRoute` still returns `shallowRef`-backed values, while `useRouteNode` returns `computed`-derived ones — both satisfy the new `Readonly<Ref>` contract. Consumers that only read `.value` are unaffected
  - **Shared `setupRouteProvision`:** extracted between `RouterProvider` and `createRouterPlugin` so both paths share identical subscription lifecycle. `createRouterPlugin` now cleans up via Vue 3.5's `app.onUnmount` when available (falls back to GC on older 3.3–3.4)
  - **Stress coverage:** expanded suites for keepalive cycling, link mass rendering, mount/unmount lifecycle, subscription fan-out, `shouldUpdate` cache, transition-hook stress, v-link directive stress

  No runtime behavior change for the documented public API aside from the nested-provider fix and the `announceNavigation` reactivity fix.

## [2026-04-13]

### @real-router/navigation-plugin@0.2.3

### Patch Changes

- [#458](https://github.com/greydragon888/real-router/pull/458) [`0b58799`](https://github.com/greydragon888/real-router/commit/0b5879966d2ea68e9ad18add8622cfe3cae2a940) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `computeDirection` returning "back" for traverse with equal indices ([#448](https://github.com/greydragon888/real-router/issues/448))

  `computeDirection("traverse", i, i)` now correctly returns `"unknown"` instead of `"back"` when destination and current indices are equal.


### @real-router/lifecycle-plugin@0.3.0

### Minor Changes

- [#456](https://github.com/greydragon888/real-router/pull/456) [`8989831`](https://github.com/greydragon888/real-router/commit/8989831062090cf6e94788a0acdc8a0cee54e0b5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add DI access to lifecycle hooks via factory pattern ([#439](https://github.com/greydragon888/real-router/issues/439))

  **Breaking Change:** `onEnter`, `onStay`, `onLeave` in route config are now factory functions `(router, getDependency) => hook` instead of plain hooks `(toState, fromState) => void`.

  **Migration:**

  ```diff
  - onEnter: (toState) => { console.log(toState.name); }
  + onEnter: () => (toState) => { console.log(toState.name); }
  ```

  With DI:

  ```typescript
  onEnter: (_router, getDep) => (toState) => {
    getDep("analytics").track(toState.name);
  };
  ```

### @real-router/preload-plugin@0.3.0

### Minor Changes

- [#456](https://github.com/greydragon888/real-router/pull/456) [`8989831`](https://github.com/greydragon888/real-router/commit/8989831062090cf6e94788a0acdc8a0cee54e0b5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add DI access to preload hook via factory pattern ([#439](https://github.com/greydragon888/real-router/issues/439))

  **Breaking Change:** `preload` in route config is now a factory function `(router, getDependency) => preloadFn` instead of a plain function `(params) => Promise<unknown>`.

  **Migration:**

  ```diff
  - preload: (params) => fetch(`/api/${params.id}`)
  + preload: () => (params) => fetch(`/api/${params.id}`)
  ```

  With DI:

  ```typescript
  preload: (_router, getDep) => (params) => {
    return getDep("apiClient").prefetch(params.id);
  };
  ```

### @real-router/ssr-data-plugin@0.3.0

### Minor Changes

- [#456](https://github.com/greydragon888/real-router/pull/456) [`8989831`](https://github.com/greydragon888/real-router/commit/8989831062090cf6e94788a0acdc8a0cee54e0b5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add DI access to data loaders via factory pattern ([#439](https://github.com/greydragon888/real-router/issues/439))

  **Breaking Change:** `DataLoaderMap` is replaced by `DataLoaderFactoryMap`. Loaders are now factory functions `(router, getDependency) => loaderFn` instead of plain functions `(params) => Promise<unknown>`.

  **Migration:**

  ```diff
  - const loaders: DataLoaderMap = {
  -   "users.profile": (params) => fetchUser(params.id),
  + const loaders: DataLoaderFactoryMap = {
  +   "users.profile": () => (params) => fetchUser(params.id),
    };
  ```

  With DI:

  ```typescript
  const loaders: DataLoaderFactoryMap = {
    "users.profile": (_router, getDep) => (params) => {
      return getDep("db").query("SELECT * FROM users WHERE id = ?", params.id);
    },
  };
  ```

## [2026-04-12]

### @real-router/browser-plugin@0.12.2

### Patch Changes

- [#454](https://github.com/greydragon888/real-router/pull/454) [`c835bfa`](https://github.com/greydragon888/real-router/commit/c835bfaec7d4fd6ca64525757e6cfc8092c11969) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractPath` matching non-segment-boundary base prefix ([#446](https://github.com/greydragon888/real-router/issues/446))

  `extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.

- [#452](https://github.com/greydragon888/real-router/pull/452) [`d337422`](https://github.com/greydragon888/real-router/commit/d337422785674a5a0801d44cc1b99647562f0080) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` ([#447](https://github.com/greydragon888/real-router/issues/447))

  Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.

### @real-router/hash-plugin@0.3.2

### Patch Changes

- [#452](https://github.com/greydragon888/real-router/pull/452) [`d337422`](https://github.com/greydragon888/real-router/commit/d337422785674a5a0801d44cc1b99647562f0080) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` ([#447](https://github.com/greydragon888/real-router/issues/447))

  Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.

### @real-router/navigation-plugin@0.2.2

### Patch Changes

- [#454](https://github.com/greydragon888/real-router/pull/454) [`c835bfa`](https://github.com/greydragon888/real-router/commit/c835bfaec7d4fd6ca64525757e6cfc8092c11969) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `extractPath` matching non-segment-boundary base prefix ([#446](https://github.com/greydragon888/real-router/issues/446))

  `extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.

- [#453](https://github.com/greydragon888/real-router/pull/453) [`27e788a`](https://github.com/greydragon888/real-router/commit/27e788a4b240657205a6abea473b310bfc2287fe) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix entryToState discarding query string and remove redundant shouldReplaceHistory call ([#449](https://github.com/greydragon888/real-router/issues/449), [#450](https://github.com/greydragon888/real-router/issues/450))

  **Bug fix ([#449](https://github.com/greydragon888/real-router/issues/449)):** `entryToState` now includes `url.search` when matching history entries, aligning with `traverseToLast` and `handleNavigateEvent` which already preserved query strings. Previously, history extensions like `peekBack`, `hasVisited`, `canGoBackTo`, and `getVisitedRoutes` would fail to match entries whose URLs contained query parameters.

  **Performance ([#450](https://github.com/greydragon888/real-router/issues/450)):** `onTransitionSuccess` no longer calls `shouldReplaceHistory()` a second time — the push/replace decision is derived from the already-computed `navigationType` on `capturedMeta`.

- [#452](https://github.com/greydragon888/real-router/pull/452) [`d337422`](https://github.com/greydragon888/real-router/commit/d337422785674a5a0801d44cc1b99647562f0080) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix TypeError in `shouldReplaceHistory` when `replace:false` + `fromState:undefined` ([#447](https://github.com/greydragon888/real-router/issues/447))

  Added optional chaining (`fromState?.path`) to prevent crash when the `??` operator preserves an explicit `false` for `replace`, bypassing the `!fromState` null guard and reaching `fromState.path` with `undefined`.


### @real-router/types@0.34.0

### Minor Changes

- [#445](https://github.com/greydragon888/real-router/pull/445) [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `StateContext` and `ContextNamespaceClaim` interfaces, make `State.context` required ([#434](https://github.com/greydragon888/real-router/issues/434))

  New `StateContext` empty interface for plugin-extensible route data via module augmentation:

  ```typescript
  declare module "@real-router/types" {
    interface StateContext {
      navigation: { direction: "forward" | "back" | "navigate" };
    }
  }

  // Now typed:
  route.context.navigation?.direction;
  ```

  New `ContextNamespaceClaim<T>` interface — returned by `PluginApi.claimContextNamespace()`, exposes `write(state, value)` and `release()` methods. Plugins use it to publish per-navigation data to `state.context.<namespace>` with collision detection.

  `State.context` is now a **required** (non-optional) field of type `StateContext & Record<string, unknown>`. Always present as `{}` at minimum on every state — created by `makeState`, `navigateToNotFound`, and `cloneRouter`. The intersection with `Record<string, unknown>` keeps the type open so inline plugins and tests can write arbitrary namespaces without augmenting the interface.

  **Breaking change (pre-1.0):** Code that manually constructs `State` objects (test fixtures, mock states) must now include `context: {}`.

### @real-router/core@0.48.0

### Minor Changes

- [#445](https://github.com/greydragon888/real-router/pull/445) [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `PluginApi.claimContextNamespace()` and shallow-freeze refactor ([#434](https://github.com/greydragon888/real-router/issues/434))

  New `claimContextNamespace(namespace)` helper on `PluginApi` — follows the same architectural model as the existing `extendRouter()` API: closure-based ownership, manual `release()` in plugin teardown, dispose safety net for forgotten releases. Uses `Set<string>` for O(1) conflict detection, registration, release, and safety-net clear.

  ```typescript
  const myPlugin: PluginFactory = (router) => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("navigation");

    return {
      onTransitionSuccess(toState, fromState) {
        claim.write(toState, {
          direction: detectDirection(fromState, toState),
        });
      },
      teardown() {
        claim.release();
      },
    };
  };

  // Later, in components:
  route.context.navigation?.direction;
  ```

  `claim.write(state, value)` is a literal one-line property assignment — zero overhead on the hot path (no validator dispatch, no optional chain, no runtime checks). `claim.release()` is naturally idempotent via `Set.delete`.

  Core enforces one runtime invariant: `CONTEXT_NAMESPACE_ALREADY_CLAIMED` — a namespace can be held by at most one active claim. Double-claiming throws a `RouterError` with this code. Orphaned claims (plugin forgot to release in teardown) are cleaned up by the dispose safety net.

  **Freeze pipeline refactored from recursive to targeted shallow freezing.** Previously, `freezeStateInPlace()` deep-froze every nested object on every navigation. Now the producers of each nested structure freeze at creation time (`params` in `makeState`, `segments`/`transition` in `buildTransitionMeta`, `deactivated`/`activated` arrays), and the final step is a single shallow `Object.freeze(state)`. `state.context` is **intentionally not frozen** so plugins can publish data after state creation. `deepFreezeState()` is unchanged (still used by `RouterError.redirect`).

  **New error code:** `CONTEXT_NAMESPACE_ALREADY_CLAIMED`.

  **Plugin authors:** if you want to protect your payload from subscriber mutation, freeze it yourself at the call site (`claim.write(state, Object.freeze(payload))`). Same model as `extendRouter()`.

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/types@0.34.0

### @real-router/browser-plugin@0.12.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

### @real-router/hash-plugin@0.3.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/lifecycle-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/logger-plugin@0.5.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/memory-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

### @real-router/navigation-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

### @real-router/persistent-params-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

### @real-router/preact@0.3.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

### @real-router/preload-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/react@0.15.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

### @real-router/route-utils@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/types@0.34.0

### @real-router/rx@0.3.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/search-schema-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/solid@0.3.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

### @real-router/sources@0.5.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/route-utils@0.2.1

### @real-router/ssr-data-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

### @real-router/svelte@0.2.13

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

### @real-router/validation-plugin@0.5.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

### @real-router/vue@0.4.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/sources@0.5.1
  - @real-router/route-utils@0.2.1

## [2026-04-11]

### @real-router/browser-plugin@0.12.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/core@0.47.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/fsm@0.4.0
  - @real-router/logger@0.3.0
  - @real-router/types@0.33.0

### @real-router/fsm@0.4.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### @real-router/hash-plugin@0.3.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/lifecycle-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/logger@0.3.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### @real-router/logger-plugin@0.5.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/memory-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/navigation-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/persistent-params-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/preact@0.3.0

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

### @real-router/preload-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/react@0.15.0

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

### @real-router/route-utils@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/types@0.33.0

### @real-router/rx@0.3.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/search-schema-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/solid@0.3.0

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

### @real-router/sources@0.5.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/route-utils@0.2.0

### @real-router/ssr-data-plugin@0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

### @real-router/types@0.33.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### @real-router/validation-plugin@0.5.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/logger@0.3.0

### @real-router/vue@0.4.0

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

### @real-router/svelte@0.2.12

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97), [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0
  - @real-router/route-utils@0.2.0
  - @real-router/sources@0.5.0

## [2026-04-10]

### @real-router/browser-plugin@0.11.8

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `browser-env` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `browser-env` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared browser API abstractions now live as bare source files in `shared/browser-env/`, accessed through a git-tracked `src/browser-env` symlink inside this package. Imports use local paths (`./browser-env/index.js`). No API changes, no bundle size difference — end users see no change.

### @real-router/hash-plugin@0.2.15

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `browser-env` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `browser-env` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared browser API abstractions now live as bare source files in `shared/browser-env/`, accessed through a git-tracked `src/browser-env` symlink inside this package. Imports use local paths (`./browser-env/index.js`). No API changes, no bundle size difference — end users see no change.

### @real-router/navigation-plugin@0.1.1

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `browser-env` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `browser-env` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared browser API abstractions now live as bare source files in `shared/browser-env/`, accessed through a git-tracked `src/browser-env` symlink inside this package. Imports use local paths (`./browser-env/index.js`). `type-guards` added to devDependencies (previously transitive via browser-env). No API changes, no bundle size difference — end users see no change.

### @real-router/preact@0.2.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

### @real-router/react@0.14.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

### @real-router/solid@0.2.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

### @real-router/svelte@0.2.11

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through the existing `src/dom-utils` symlink (now repointed to `../../../shared/dom-utils`). The `kit.alias` indirection in `svelte.config.js` has been removed in favor of direct relative imports (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.

### @real-router/vue@0.3.6

### Patch Changes

- [#440](https://github.com/greydragon888/real-router/pull/440) [`5e38674`](https://github.com/greydragon888/real-router/commit/5e386740ae11bba7fe9b5227b59aac4750b80819) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `dom-utils` workspace package with symlinked shared sources ([#437](https://github.com/greydragon888/real-router/issues/437))

  Internal refactor: `dom-utils` infrastructure (tsdown config, package.json exports, docs) has been removed. Shared DOM utilities now live as bare source files in `shared/dom-utils/`, accessed through a `src/dom-utils` symlink inside this package. Imports use local paths (`./dom-utils/index.js`, `../dom-utils/index.js`). No API changes, no bundle size difference — end users see no change.


### @real-router/navigation-plugin@0.1.0

### Minor Changes

- [#436](https://github.com/greydragon888/real-router/pull/436) [`8103290`](https://github.com/greydragon888/real-router/commit/8103290e7931c219ac0157423c51a2b85d98f156) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(navigation-plugin): Navigation API browser plugin

  Drop-in replacement for `@real-router/browser-plugin` that uses the Navigation API instead of History API. Same compatible extensions (buildUrl, matchUrl, replaceHistoryState, start) plus exclusive route-level history extensions: peekBack, peekForward, hasVisited, getVisitedRoutes, getRouteVisitCount, traverseToLast, getNavigationMeta, canGoBack, canGoForward, canGoBackTo.

  Ref: [#293](https://github.com/greydragon888/real-router/issues/293)

## [2026-04-08]

### @real-router/core@0.46.0

### Minor Changes

- [#432](https://github.com/greydragon888/real-router/pull/432) [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1) Thanks [@greydragon888](https://github.com/greydragon888)! - Support async `subscribeLeave` listeners for exit animations and View Transitions ([#391](https://github.com/greydragon888/real-router/issues/391))

  Leave listeners move from EventEmitter to separate array with `Promise.allSettled` error handling. Independent listeners survive each other's failures. `AbortSignal` enables cooperative cancellation on concurrent navigation.

### Patch Changes

- [#432](https://github.com/greydragon888/real-router/pull/432) [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize navigate hot path for async leave overhead ([#391](https://github.com/greydragon888/real-router/issues/391))

  Skip `AbortController.abort()` on sync leave path, defer `NavigationContext` to async branch, move `isCurrentNav` closure to guards block. Benchmarks vs master: 0 listeners −29%, 1 sync listener −7%, 3 sync listeners −11%.

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/types@0.32.0

### @real-router/types@0.32.0

### Minor Changes

- [#432](https://github.com/greydragon888/real-router/pull/432) [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `signal: AbortSignal` to `LeaveState` and extend `LeaveFn` return type to `void | Promise<void>` ([#391](https://github.com/greydragon888/real-router/issues/391))

### @real-router/browser-plugin@0.11.7

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/hash-plugin@0.2.14

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/lifecycle-plugin@0.1.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/logger-plugin@0.4.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/memory-plugin@0.1.3

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/persistent-params-plugin@0.1.52

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/preact@0.2.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

### @real-router/preload-plugin@0.1.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/react@0.14.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

### @real-router/route-utils@0.1.14

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/types@0.32.0

### @real-router/rx@0.2.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/search-schema-plugin@0.1.3

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/solid@0.2.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

### @real-router/sources@0.4.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/route-utils@0.1.14

### @real-router/ssr-data-plugin@0.1.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/svelte@0.2.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14

### @real-router/validation-plugin@0.4.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

### @real-router/vue@0.3.5

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0
  - @real-router/sources@0.4.4
  - @real-router/route-utils@0.1.14


### @real-router/fsm@0.3.0

### Minor Changes

- [#429](https://github.com/greydragon888/real-router/pull/429) [`15e7758`](https://github.com/greydragon888/real-router/commit/15e7758ed2ef4536bf332ac30cdace880951acea) Thanks [@greydragon888](https://github.com/greydragon888)! - fix(fsm): on() unsubscribe no longer deletes overwritten action ([#427](https://github.com/greydragon888/real-router/issues/427))

### @real-router/core@0.45.3

### Patch Changes

- Updated dependencies [[`15e7758`](https://github.com/greydragon888/real-router/commit/15e7758ed2ef4536bf332ac30cdace880951acea)]:
  - @real-router/fsm@0.3.0

## [2026-04-07]

### @real-router/browser-plugin@0.11.6

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/core@0.45.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/fsm@0.2.4
  - @real-router/logger@0.2.3
  - @real-router/types@0.31.2

### @real-router/fsm@0.2.4

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

### @real-router/hash-plugin@0.2.13

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/lifecycle-plugin@0.1.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/logger@0.2.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

### @real-router/logger-plugin@0.4.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/memory-plugin@0.1.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/persistent-params-plugin@0.1.51

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/preact@0.2.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

### @real-router/preload-plugin@0.1.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/react@0.14.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

### @real-router/route-utils@0.1.13

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/types@0.31.2

### @real-router/rx@0.2.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/search-schema-plugin@0.1.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/solid@0.2.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link rest props type compatibility with solid-js 1.9.12 ([#418](https://github.com/greydragon888/real-router/issues/418))

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

### @real-router/sources@0.4.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13

### @real-router/ssr-data-plugin@0.1.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

### @real-router/svelte@0.2.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3

### @real-router/types@0.31.2

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

### @real-router/validation-plugin@0.4.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/logger@0.2.3

### @real-router/vue@0.3.4

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33), [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2
  - @real-router/route-utils@0.1.13
  - @real-router/sources@0.4.3


### @real-router/browser-plugin@0.11.5

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/core@0.45.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/fsm@0.2.3
  - @real-router/logger@0.2.2
  - @real-router/types@0.31.1

### @real-router/fsm@0.2.3

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

### @real-router/hash-plugin@0.2.12

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/lifecycle-plugin@0.1.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/logger@0.2.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

### @real-router/logger-plugin@0.4.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/memory-plugin@0.1.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/persistent-params-plugin@0.1.50

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/preact@0.2.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

### @real-router/preload-plugin@0.1.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/react@0.14.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

### @real-router/route-utils@0.1.12

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/types@0.31.1

### @real-router/rx@0.2.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/search-schema-plugin@0.1.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/solid@0.2.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link rest props type compatibility with solid-js 1.9.12 ([#418](https://github.com/greydragon888/real-router/issues/418))

  Added type assertion for `rest` spread on `<a>` element to satisfy `exactOptionalPropertyTypes` constraint introduced in solid-js 1.9.12.

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

### @real-router/sources@0.4.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12

### @real-router/ssr-data-plugin@0.1.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

### @real-router/svelte@0.2.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2

### @real-router/types@0.31.1

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

### @real-router/validation-plugin@0.4.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/logger@0.2.2

### @real-router/vue@0.3.3

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c), [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1
  - @real-router/route-utils@0.1.12
  - @real-router/sources@0.4.2


### @real-router/preact@0.2.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/preact` failed with `ETARGET: No matching version found for dom-utils`.

### @real-router/react@0.14.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/react` failed with `ETARGET: No matching version found for dom-utils`.

### @real-router/solid@0.2.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies`. Rollup already inlines `dom-utils` via `nodeResolve`, but the dependency declaration caused `npm install @real-router/solid` to fail with `ETARGET: No matching version found for dom-utils`.

### @real-router/svelte@0.2.7

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies`. Previously, `npm install @real-router/svelte` failed with `ETARGET: No matching version found for dom-utils`.

### @real-router/vue@0.3.2

### Patch Changes

- [#414](https://github.com/greydragon888/real-router/pull/414) [`db93554`](https://github.com/greydragon888/real-router/commit/db93554700e9156b92559662ad1370ad94d0e50b) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix unpublished `dom-utils` leaking into npm dependencies ([#413](https://github.com/greydragon888/real-router/issues/413))

  Moved `dom-utils` from `dependencies` to `devDependencies` and added `alwaysBundle` to inline it into the build output. Previously, `npm install @real-router/vue` failed with `ETARGET: No matching version found for dom-utils`.

## [2026-04-06]

### @real-router/memory-plugin@0.1.0

### Minor Changes

- [#410](https://github.com/greydragon888/real-router/pull/410) [`546706b`](https://github.com/greydragon888/real-router/commit/546706b65af2ba9f46ad33666fada7e6a58ca6f3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix index desync when guard blocks back/forward navigation ([#294](https://github.com/greydragon888/real-router/issues/294))

  `#go(delta)` now updates `#index` in `.then()` instead of synchronously before `navigate()`. If a guard blocks the navigation, the index stays unchanged — `canGoBack()`/`canGoForward()` always reflect the actual router state. Also adds early return for `go(0)`.

## [2026-04-05]

### @real-router/core@0.45.0

### Minor Changes

- [#406](https://github.com/greydragon888/real-router/pull/406) [`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add interceptable `add` method for route addition hooks ([#406](https://github.com/greydragon888/real-router/issues/406))

  The `add` method in `getRoutesApi()` is now interceptable via `addInterceptor("add", fn)`. Plugins can hook into dynamic route additions to perform validation or side effects when routes are added at runtime.

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/types@0.31.0

### @real-router/search-schema-plugin@0.1.0

### Minor Changes

- [#406](https://github.com/greydragon888/real-router/pull/406) [`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/search-schema-plugin` — runtime search parameter validation via Standard Schema V1 ([#406](https://github.com/greydragon888/real-router/issues/406))

  New plugin that validates search parameters against Standard Schema V1 (Zod 3.24+, Valibot 1.0+, ArkType) using the `forwardState` interceptor.

  Features:
  - Automatic strip of invalid params + merge with `defaultParams` for recovery
  - `mode: "development"` (console.error) / `"production"` (silent strip)
  - `strict` mode to remove unknown params
  - Custom `onError` callback for full control
  - Dev-time `defaultParams` validation at `usePlugin()` time
  - Dynamic route validation via `add` interceptor

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/types@0.31.0

### Minor Changes

- [#406](https://github.com/greydragon888/real-router/pull/406) [`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `add` to `InterceptableMethodMap` interface ([#406](https://github.com/greydragon888/real-router/issues/406))

  New `add` entry in `InterceptableMethodMap` enables type-safe `addInterceptor("add", fn)` for plugins that need to react to dynamic route additions.

### @real-router/browser-plugin@0.11.4

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/hash-plugin@0.2.11

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/lifecycle-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/logger-plugin@0.4.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/persistent-params-plugin@0.1.49

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/preact@0.2.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

### @real-router/preload-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/react@0.14.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

### @real-router/route-utils@0.1.11

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/types@0.31.0

### @real-router/rx@0.2.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/solid@0.2.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

### @real-router/sources@0.4.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - @real-router/route-utils@0.1.11

### @real-router/ssr-data-plugin@0.1.7

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/svelte@0.2.6

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

### @real-router/validation-plugin@0.4.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

### @real-router/vue@0.3.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0
  - dom-utils@0.2.7
  - @real-router/sources@0.4.1
  - @real-router/route-utils@0.1.11

## [2026-04-04]

### @real-router/preload-plugin@0.1.0

### Minor Changes

- [#403](https://github.com/greydragon888/real-router/pull/403) [`223e0ed`](https://github.com/greydragon888/real-router/commit/223e0ed9ed01d47d069e0a1a0425e2771f428127) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/preload-plugin` — preloading on navigation intent ([#402](https://github.com/greydragon888/real-router/issues/402))

  New plugin that triggers user-defined `preload` functions when users hover over or touch links, before actual navigation. Uses DOM-level event delegation — zero changes to framework adapters.

  Features:
  - Hover preloading with configurable debounce (default 65ms)
  - Touch preloading with scroll detection cancel
  - Ghost mouse event suppression (mobile compat events)
  - Network awareness (disabled on Save-Data / 2G)
  - Per-link opt-out via `data-no-preload` attribute
  - SSR-safe (no-op on server)
  - Graceful degradation without browser-plugin

  ```typescript
  const routes = [
    {
      name: "users.profile",
      path: "/users/:id",
      preload: async (params) => {
        await queryClient.prefetchQuery({
          queryKey: ["user", params.id],
          queryFn: () => fetchUser(params.id),
        });
      },
    },
  ];

  router.usePlugin(preloadPluginFactory({ delay: 100 }));
  ```


### @real-router/core@0.44.2

### Patch Changes

- [#400](https://github.com/greydragon888/real-router/pull/400) [`a42f2ed`](https://github.com/greydragon888/real-router/commit/a42f2ed0bcc046103d075e8b5634ac50ba6a613e) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize path-matcher hot path: splat backtracking, static result caching, property access ([#386](https://github.com/greydragon888/real-router/issues/386))
  - Skip splat backtracking when splat node has no children (-36% splat match)
  - Pre-compute frozen `MatchResult` for static routes — zero-alloc fast path (-12% static match)
  - Cache `caseSensitive` and decode function on instance to avoid per-segment property chain (-13% dynamic match)


### @real-router/core@0.44.1

### Patch Changes

- [#398](https://github.com/greydragon888/real-router/pull/398) [`0d64c34`](https://github.com/greydragon888/real-router/commit/0d64c34d826a2941921ebaa2ca029d6c51a318b4) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix comma array format decode — `parse("items=a,b,c", {arrayFormat: "comma"})` now returns array ([#396](https://github.com/greydragon888/real-router/issues/396))

- [#398](https://github.com/greydragon888/real-router/pull/398) [`0d64c34`](https://github.com/greydragon888/real-router/commit/0d64c34d826a2941921ebaa2ca029d6c51a318b4) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `numberFormat: "auto"` lossy roundtrip for leading zeros and unsafe integers ([#396](https://github.com/greydragon888/real-router/issues/396))

  `"00"`, `"007"` now stay as strings instead of being parsed as `0`, `7`. Integers beyond `Number.MAX_SAFE_INTEGER` also stay as strings to prevent precision loss.


### @real-router/lifecycle-plugin@0.1.0

### Minor Changes

- [#395](https://github.com/greydragon888/real-router/pull/395) [`5a5b829`](https://github.com/greydragon888/real-router/commit/5a5b82903b2795d9fd063f164959ec3fae5ea13d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add lifecycle-plugin: route-level onEnter, onStay, onLeave hooks ([#394](https://github.com/greydragon888/real-router/issues/394))

  New plugin that adds declarative lifecycle hooks to route definitions:

  ```typescript
  import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";

  const routes = [
    {
      name: "dashboard",
      path: "/dashboard",
      onEnter: (toState) => analytics.track("dashboard_viewed"),
      onLeave: () => cleanup(),
    },
    {
      name: "users.view",
      path: "/users/:id",
      onStay: (toState, fromState) => refreshUser(toState.params.id),
    },
  ];

  router.usePlugin(lifecyclePluginFactory());
  ```

  - `onLeave` fires at `TRANSITION_LEAVE_APPROVE` (early, before activation guards)
  - `onEnter` / `onStay` fire at `TRANSITION_SUCCESS`
  - Module augmentation extends `Route` interface with typed hook fields
  - No configuration, stateless, ~0.5 kB

## [2026-04-03]

### @real-router/core@0.44.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `LEAVE_APPROVED` FSM state, `TRANSITION_LEAVE_APPROVE` event, `router.subscribeLeave()` ([#391](https://github.com/greydragon888/real-router/issues/391))

  New FSM state `LEAVE_APPROVED` between deactivation and activation guard phases.
  New event `TRANSITION_LEAVE_APPROVE` fires when deactivation is confirmed but before state changes.
  New public API `router.subscribeLeave(listener)` for leave side-effects (scroll save, analytics, cleanup).
  New query `router.isLeaveApproved()` to distinguish deactivation-passed sub-phase.
  Renamed FSM state `TRANSITIONING` → `TRANSITION_STARTED`.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/types@0.30.0

### @real-router/logger-plugin@0.4.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Log `TRANSITION_LEAVE_APPROVE` event ([#391](https://github.com/greydragon888/real-router/issues/391))

  New `onTransitionLeaveApprove` hook logs leave-approve phase with timing.
  Enables deactivation phase duration measurement (time from START to LEAVE_APPROVE).

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/rx@0.2.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `TRANSITION_LEAVE_APPROVE` to `events$` Observable stream ([#391](https://github.com/greydragon888/real-router/issues/391))

  `events$` now emits `{ type: "TRANSITION_LEAVE_APPROVE", toState, fromState }` events.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/sources@0.4.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `isLeaveApproved` to `RouterTransitionSnapshot` ([#391](https://github.com/greydragon888/real-router/issues/391))

  `RouterTransitionSnapshot` now includes `isLeaveApproved: boolean` field.
  Enables direction-aware exit animations via `useRouterTransition()` in all framework adapters.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/route-utils@0.1.10

### @real-router/types@0.30.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `LeaveState`, `LeaveFn` types and `Plugin.onTransitionLeaveApprove` hook ([#391](https://github.com/greydragon888/real-router/issues/391))

  New types for leave side-effects: `LeaveState` interface, `LeaveFn` type.
  New plugin hook `onTransitionLeaveApprove` fires after deactivation guards pass.
  `Navigator` and `Router` interfaces extended with `subscribeLeave` and `isLeaveApproved`.

### @real-router/validation-plugin@0.4.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Support `TRANSITION_LEAVE_APPROVE` event validation ([#391](https://github.com/greydragon888/real-router/issues/391))

  Added `onTransitionLeaveApprove` to valid plugin methods and `$$leaveApprove` to valid event names.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/vue@0.3.0

### Minor Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add per-Match `keepAlive` support to `RouteView` ([#391](https://github.com/greydragon888/real-router/issues/391))

  `<RouteView.Match>` now accepts an optional `keepAlive` prop for granular control over which routes preserve state. Previously, `keepAlive` was only available on the root `<RouteView>` (all-or-nothing). Per-Match keepAlive uses a persistent `<KeepAlive>` instance with wrapper components to maintain Vue's cache across navigations.

  ```vue
  <RouteView nodeName="">
    <RouteView.Match segment="dashboard" keepAlive>
      <Dashboard />  <!-- State preserved -->
    </RouteView.Match>
    <RouteView.Match segment="settings">
      <Settings />  <!-- Unmounts normally -->
    </RouteView.Match>
  </RouteView>
  ```

  Root-level `<RouteView keepAlive>` behavior is unchanged.

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

### @real-router/browser-plugin@0.11.3

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/hash-plugin@0.2.10

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/persistent-params-plugin@0.1.48

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/preact@0.2.5

### Patch Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add eslint-disable comment for intentional ref pattern ([#391](https://github.com/greydragon888/real-router/issues/391))

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

### @real-router/react@0.14.5

### Patch Changes

- [#392](https://github.com/greydragon888/real-router/pull/392) [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add eslint-disable comments for intentional ref patterns ([#391](https://github.com/greydragon888/real-router/issues/391))

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

### @real-router/route-utils@0.1.10

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/types@0.30.0

### @real-router/solid@0.2.5

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

### @real-router/ssr-data-plugin@0.1.6

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

### @real-router/svelte@0.2.5

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc), [`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0
  - @real-router/sources@0.4.0
  - dom-utils@0.2.6
  - @real-router/route-utils@0.1.10

## [2026-04-01]

### @real-router/core@0.43.0

### Minor Changes

- [#389](https://github.com/greydragon888/real-router/pull/389) [`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780) Thanks [@greydragon888](https://github.com/greydragon888)! - Change default `booleanFormat` and `numberFormat` to `"auto"` ([#387](https://github.com/greydragon888/real-router/issues/387))

  **Breaking Change:** Default query parameter options now auto-detect types:
  - `booleanFormat`: `"none"` → `"auto"` (`"true"`/`"false"` parsed as booleans)
  - `numberFormat`: `"none"` → `"auto"` (numeric strings parsed as numbers)

  Use `{ booleanFormat: "none", numberFormat: "none" }` to restore previous behavior.

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/types@0.29.0

### @real-router/types@0.29.0

### Minor Changes

- [#389](https://github.com/greydragon888/real-router/pull/389) [`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780) Thanks [@greydragon888](https://github.com/greydragon888)! - Rename `BooleanFormat` value `"string"` to `"auto"` ([#387](https://github.com/greydragon888/real-router/issues/387))

  **Breaking Change:** The `"string"` value of `BooleanFormat` type has been renamed to `"auto"` for symmetry with `NumberFormat`.

  **Migration:**

  ```diff
  - queryParams: { booleanFormat: "string" }
  + queryParams: { booleanFormat: "auto" }
  ```

### @real-router/browser-plugin@0.11.2

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/hash-plugin@0.2.9

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/logger-plugin@0.3.8

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/persistent-params-plugin@0.1.47

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/preact@0.2.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

### @real-router/react@0.14.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

### @real-router/route-utils@0.1.9

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/types@0.29.0

### @real-router/rx@0.1.35

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/solid@0.2.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

### @real-router/sources@0.3.3

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9

### @real-router/ssr-data-plugin@0.1.5

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/svelte@0.2.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

### @real-router/validation-plugin@0.3.1

### Patch Changes

- [#389](https://github.com/greydragon888/real-router/pull/389) [`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780) Thanks [@greydragon888](https://github.com/greydragon888)! - Update valid `booleanFormat` values: `"string"` renamed to `"auto"` ([#387](https://github.com/greydragon888/real-router/issues/387))

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

### @real-router/vue@0.2.4

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0
  - @real-router/route-utils@0.1.9
  - dom-utils@0.2.5
  - @real-router/sources@0.3.3

## [2026-03-31]

### @real-router/core@0.42.0

### Minor Changes

- [#384](https://github.com/greydragon888/real-router/pull/384) [`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `numberFormat` option to router query params ([#383](https://github.com/greydragon888/real-router/issues/383))

  New `numberFormat` option (`"none"` | `"auto"`) in `queryParams` configuration. When set to `"auto"`, numeric query parameter values (e.g. `?page=1&price=12.5`) are automatically parsed as numbers instead of strings. Defaults to `"none"` (no behavior change).

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/types@0.28.0

### @real-router/types@0.28.0

### Minor Changes

- [#384](https://github.com/greydragon888/real-router/pull/384) [`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `NumberFormat` type for numeric query parameter parsing ([#383](https://github.com/greydragon888/real-router/issues/383))

  New `NumberFormat` type (`"none" | "auto"`) and `numberFormat` field in `QueryParamsOptions`. Resolves the asymmetry where `booleanFormat` existed but numeric values had no equivalent option.

### @real-router/validation-plugin@0.3.0

### Minor Changes

- [#384](https://github.com/greydragon888/real-router/pull/384) [`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `numberFormat` validation support ([#383](https://github.com/greydragon888/real-router/issues/383))

  Validate `queryParams.numberFormat` option — accepts `"none"` or `"auto"`, throws `TypeError` for invalid values.

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/browser-plugin@0.11.1

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/hash-plugin@0.2.8

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/logger-plugin@0.3.7

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/persistent-params-plugin@0.1.46

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/preact@0.2.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

### @real-router/react@0.14.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

### @real-router/route-utils@0.1.8

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/types@0.28.0

### @real-router/rx@0.1.34

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/solid@0.2.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

### @real-router/sources@0.3.2

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - @real-router/route-utils@0.1.8

### @real-router/ssr-data-plugin@0.1.4

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

### @real-router/svelte@0.2.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

### @real-router/vue@0.2.3

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0
  - dom-utils@0.2.4
  - @real-router/sources@0.3.2
  - @real-router/route-utils@0.1.8

## [2026-03-30]

### @real-router/preact@0.2.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

### @real-router/react@0.14.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

### @real-router/solid@0.2.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component and `use:link` directive crash with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

  `use:link` directive also fixed — replaced direct `router.buildPath()` with `buildHref()`, which also adds `buildUrl` support (browser-plugin) previously missing from the directive.

### @real-router/svelte@0.2.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

### @real-router/vue@0.2.2

### Patch Changes

- [#381](https://github.com/greydragon888/real-router/pull/381) [`c305929`](https://github.com/greydragon888/real-router/commit/c3059292e6e5c17dfa59888110a78c5284cbc5ef) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix Link component crash on render with invalid routeName ([#372](https://github.com/greydragon888/real-router/issues/372))

  `<Link routeName="nonexistent">` no longer throws during render. Renders `<a>` without `href` attribute and logs `console.error` with the invalid route name.

## [2026-03-29]

### @real-router/browser-plugin@0.11.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `meta` from history state, remove `forceId` from popstate restoration ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `state.meta` is no longer written to `history.state` or restored on popstate. `forceId` no longer passed to `makeState`.

  Existing history entries with `meta` are not affected — extra fields are ignored.

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/core@0.41.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Internalize `State.meta`, remove `forceId` pipeline, optimize `areStatesEqual` ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `State.meta` is no longer part of the public API. `forceId` parameter removed from `makeState`.
  - `reload` and `redirected` flags moved to `state.transition`
  - `transitionPath` accepts optional `opts` parameter for reload detection
  - `shouldUpdateNode` reads `reload` from `state.transition` instead of `state.meta.options`
  - Removed `EMPTY_OPTIONS` constant, `cleanOpts` helper, `getUrlParamsFromMeta` helper
  - Removed `meta.id`, `#stateId` counter, `forceId` parameter (dead code — nobody read `meta.id`)
  - Route param type mapping stored in `WeakMap<State, Params>` (no wrapper object)
  - `areStatesEqual` uses cached `#urlParamsCache` instead of WeakMap lookup
  - `freezeStateInPlace` no longer freezes internal meta
  - `areStatesEqual` and `areParamValuesEqual` use `for` loops instead of `.every()`

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/types@0.27.0

### @real-router/types@0.27.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `State.meta` from public API, remove `forceId` from `PluginApi.makeState` ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `State` no longer exposes `meta` property. `StateMeta` type removed from public exports. Second type parameter `MP` removed from `State<P, MP>` (now `State<P>`). `forceId` parameter removed from `PluginApi.makeState`.

  `TransitionMeta` extended with optional `reload` and `redirected` fields.

  **Migration:**

  ```diff
  - if (state.meta?.options?.redirected) { ... }
  + if (state.transition?.redirected) { ... }

  - if (state.meta?.options?.reload) { ... }
  + if (state.transition?.reload) { ... }

  - const guard = (router: Router) => (toState: State<P, MP>) => { ... }
  + const guard = (router: Router) => (toState: State<P>) => { ... }

  - api.makeState("route", params, path, meta, forceId)
  + api.makeState("route", params, path, meta)
  ```

### @real-router/validation-plugin@0.2.0

### Minor Changes

- [#376](https://github.com/greydragon888/real-router/pull/376) [`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `forceId` validation from `validateMakeStateArgs` ([#202](https://github.com/greydragon888/real-router/issues/202))

  **Breaking Change:** `validateMakeStateArgs` no longer accepts or validates `forceId` parameter (4th argument removed).

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/hash-plugin@0.2.7

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/logger-plugin@0.3.6

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/persistent-params-plugin@0.1.45

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/preact@0.2.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

### @real-router/react@0.14.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

### @real-router/route-utils@0.1.7

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/types@0.27.0

### @real-router/rx@0.1.33

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/solid@0.2.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

### @real-router/sources@0.3.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - @real-router/route-utils@0.1.7

### @real-router/ssr-data-plugin@0.1.3

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

### @real-router/svelte@0.2.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

### @real-router/vue@0.2.1

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0
  - dom-utils@0.2.3
  - @real-router/sources@0.3.1
  - @real-router/route-utils@0.1.7

## [2026-03-28]

### @real-router/preact@0.2.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New component that shows a fallback alongside children when a navigation error occurs. Auto-resets on successful navigation. Supports `resetError()` for manual dismiss and `onError` callback for logging.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

### @real-router/react@0.14.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New component that shows a fallback **alongside** children when a navigation error occurs (guard rejection, route not found). Auto-resets on successful navigation. Supports manual dismiss via `resetError()` and side-effect logging via `onError` callback. Available from both `@real-router/react` and `@real-router/react/legacy`.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

### @real-router/solid@0.2.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New component that shows a fallback alongside children when a navigation error occurs. Uses Solid signals (`createSignal`, `createMemo`, `createEffect`) for fine-grained reactivity. Auto-resets on successful navigation.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

### @real-router/sources@0.3.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createErrorSource` factory for navigation error tracking ([#366](https://github.com/greydragon888/real-router/issues/366))

  New eager-subscription source that tracks `TRANSITION_ERROR` events. Provides `RouterErrorSnapshot` with `error`, `toRoute`, `fromRoute`, and `version` fields. Resets on `TRANSITION_SUCCESS`. Skips update when no error exists (avoids unnecessary re-renders).

### @real-router/svelte@0.2.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New Svelte 5 component using Runes (`$state`, `$derived`, `$effect`) and Snippets for typed fallback rendering. Shows a fallback alongside children when a navigation error occurs. Uses `untrack()` for `onError` callback stability. Auto-resets on successful navigation.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

### @real-router/vue@0.2.0

### Minor Changes

- [#370](https://github.com/greydragon888/real-router/pull/370) [`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RouterErrorBoundary` component for declarative navigation error handling ([#366](https://github.com/greydragon888/real-router/issues/366))

  New `defineComponent` that shows a fallback alongside slot children when a navigation error occurs. Uses `watch({ immediate: true })` for `onError` callback, `computed` for visible error, and `shallowRef` for dismissed state. Auto-resets on successful navigation.

### Patch Changes

- Updated dependencies [[`36bff43`](https://github.com/greydragon888/real-router/commit/36bff43b21e065feeb0cc488b5a72873cac4e514)]:
  - @real-router/sources@0.3.0

## [2026-03-27]

### @real-router/browser-plugin@0.10.6

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `areStatesEqual` with path comparison in `shouldReplaceHistory` ([#364](https://github.com/greydragon888/real-router/issues/364))

  Use `toState.path === fromState?.path` instead of `router.areStatesEqual()` to detect same-state reload. Removes `router` parameter dependency from `shouldReplaceHistory`.

- Updated dependencies [[`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e)]:
  - @real-router/core@0.40.1

### @real-router/core@0.40.1

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `areStatesEqual` with path comparison in `isSameNavigation` ([#364](https://github.com/greydragon888/real-router/issues/364))

  Use `fromState.path === toState.path` instead of O(n) param iteration to detect duplicate navigations. Path is the canonical representation of (name, params) — single string comparison on every `navigate()` call.

### @real-router/hash-plugin@0.2.6

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `areStatesEqual` with path comparison in `shouldReplaceHistory` ([#364](https://github.com/greydragon888/real-router/issues/364))

  Use `toState.path === fromState?.path` instead of `router.areStatesEqual()` to detect same-state reload. Removes `router` parameter dependency from `shouldReplaceHistory`.

- Updated dependencies [[`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e)]:
  - @real-router/core@0.40.1

### @real-router/sources@0.2.8

### Patch Changes

- [#365](https://github.com/greydragon888/real-router/pull/365) [`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `stabilizeState` to prevent unnecessary re-renders across all frameworks ([#339](https://github.com/greydragon888/real-router/issues/339))

  Path-based State reference stabilization: when `prev.path === next.path`, returns the previous State reference instead of creating a new snapshot. O(1) string comparison — no recursive object traversal.

  Integrated into `computeSnapshot`, `createRouteSource`, and `createTransitionSource`. Guards before `updateSnapshot` prevent unnecessary listener notifications.

- Updated dependencies [[`ae85a49`](https://github.com/greydragon888/real-router/commit/ae85a49b77f2945f1943cdb44b74281a53f0981e)]:
  - @real-router/core@0.40.1

## [2026-03-26]

### @real-router/core@0.40.0

### Minor Changes

- [#362](https://github.com/greydragon888/real-router/pull/362) [`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `getStaticPaths()` utility for SSG pre-rendering ([#335](https://github.com/greydragon888/real-router/issues/335))

  New `getStaticPaths(router, entries?)` function in `@real-router/core/utils` enumerates all leaf routes from the router tree and builds their URLs. For dynamic routes (`:id`), accepts an `entries` map providing parameter sets to pre-render.

  ```typescript
  import { getStaticPaths } from "@real-router/core/utils";

  const paths = await getStaticPaths(router, {
    "users.profile": async () => [{ id: "1" }, { id: "2" }],
  });
  // → ["/", "/users", "/users/1", "/users/2"]
  ```

  Also exports `StaticPathEntries` type for the `entries` parameter.

### @real-router/browser-plugin@0.10.5

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/hash-plugin@0.2.5

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/logger-plugin@0.3.5

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/persistent-params-plugin@0.1.44

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/preact@0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

### @real-router/react@0.13.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

### @real-router/rx@0.1.32

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/solid@0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

### @real-router/sources@0.2.7

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/ssr-data-plugin@0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/svelte@0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7

### @real-router/validation-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

### @real-router/vue@0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0
  - dom-utils@0.2.2
  - @real-router/sources@0.2.7


### @real-router/core@0.39.0

### Minor Changes

- d1ebff8: `usePlugin()` silently skips `false`, `null`, and `undefined` values (#341)

  Enables inline conditional plugin registration:

  ```typescript
  router.usePlugin(
    browserPlugin(),
    __DEV__ && loggerPlugin(),
    hasConsent && analyticsPlugin(),
  );
  ```

  Falsy values are filtered before validation. If all values are falsy, returns a noop unsubscribe function.

- d1ebff8: Breaking: remove `noValidate` option — validation is now opt-in via plugin (#334)

  The `noValidate: true` router option has been removed. Validation is now disabled by default and enabled by registering `@real-router/validation-plugin`.

  **Before:**

  ```typescript
  const router = createRouter(routes, { noValidate: true }); // disable validation
  ```

  **After:**

  ```typescript
  const router = createRouter(routes); // validation off by default
  router.usePlugin(validationPlugin()); // opt in
  ```

  Core now ships with lightweight crash guards only (`guardDependencies`, `guardRouteStructure`). Full DX validation (descriptive errors, argument shape checks, forwardTo cycle detection) requires the plugin.

  The `resolveForwardChain` function is now always used in `refreshForwardMap` (previously conditional on `noValidate`). This is a behavioral change: forward chain resolution now always runs, which is the correct behavior.

### Patch Changes

- d1ebff8: Extract remaining DX validators behind `ctx.validator` and remove `type-guards` from bundle (#334)

  Phase 2 of validation extraction: 17 new `RouterValidator` slots, setter injection for `PluginsNamespace` and `RouteLifecycleNamespace`, `type-guards` removed from `noExternal` (no longer bundled). Core bundle reduced by ~3.6 kB (brotli).

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/types@0.26.0

### @real-router/types@0.26.0

### Minor Changes

- d1ebff8: `usePlugin()` accepts `false | null | undefined` in type signature (#341)

  The `Router.usePlugin()` type signature now accepts falsy values alongside `PluginFactory`, enabling `__DEV__ && plugin()` patterns.

- d1ebff8: Breaking: remove `noValidate` from `RouterOptions` (#334)

  The `noValidate` field has been removed from the `RouterOptions` interface. Validation is now opt-in via `@real-router/validation-plugin` rather than opt-out via a router option.

### @real-router/types@0.25.0

### Minor Changes

- Remove `noValidate` option from `Options` interface. Runtime validation is now opt-in via `@real-router/validation-plugin` instead of opt-out via router option.

- Update `usePlugin` signature to accept falsy values (`false | null | undefined`). Enables inline conditional plugin registration: `router.usePlugin(browserPlugin(), isDev && validationPlugin())`.

### @real-router/validation-plugin@0.1.0

### Minor Changes

- d1ebff8: Implement Phase 2 validator slots: options, dependencies, plugins, lifecycle, routes (#334)

  17 new validator implementations: `validateOptions` (retrospective), `validateDependencyCount`, `validateCloneArgs`, `validatePluginKeys`, threshold warnings, overwrite warnings, async guard detection. Property-based tests verify invariants across ~58k generated inputs.

- d1ebff8: New package: extract DX validation from core into opt-in plugin (#334)

  `@real-router/validation-plugin` provides the full validation layer previously built into `@real-router/core`. Register before `router.start()` to enable descriptive type errors and argument checks across all router operations.

  ```typescript
  import { validationPlugin } from "@real-router/validation-plugin";

  const router = createRouter(routes);
  router.usePlugin(validationPlugin()); // opt in to DX validation
  await router.start();
  ```

  The plugin runs retrospective validation at registration time, catching route tree errors that occurred before `usePlugin()` was called.

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/browser-plugin@0.10.4

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/hash-plugin@0.2.4

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/logger-plugin@0.3.4

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/persistent-params-plugin@0.1.43

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/preact@0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - dom-utils@0.2.1
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6

### @real-router/react@0.13.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - dom-utils@0.2.1
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6

### @real-router/route-utils@0.1.6

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/types@0.26.0

### @real-router/rx@0.1.31

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/solid@0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - dom-utils@0.2.1
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6

### @real-router/sources@0.2.6

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - @real-router/route-utils@0.1.6

### @real-router/ssr-data-plugin@0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

### @real-router/svelte@0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - dom-utils@0.2.1
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6

### @real-router/vue@0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0
  - dom-utils@0.2.1
  - @real-router/sources@0.2.6
  - @real-router/route-utils@0.1.6

## [2026-03-23]

### @real-router/preact@0.1.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```tsx
  <RouterProvider router={router} announceNavigation>
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/preact` — Preact integration for Real-Router ([#289](https://github.com/greydragon888/real-router/issues/289))

  New package providing Preact bindings with the same API as `@real-router/react`:
  - `RouterProvider`, `Link`, `RouteView` components
  - `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` hooks
  - Custom `useSyncExternalStore` polyfill (Preact has no native implementation)
  - No `keepAlive` support (Preact has no `Activity` API)
  - Single entry point (no legacy split)

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `RouteView.Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, children are automatically wrapped in `<Suspense>` from `preact/compat`.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName` moved from local `utils.ts` into shared private `dom-utils` package.

### @real-router/react@0.13.0

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

### @real-router/solid@0.1.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```tsx
  <RouterProvider router={router} announceNavigation>
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/solid` — Solid.js integration for Real-Router ([#290](https://github.com/greydragon888/real-router/issues/290))

  New package providing Solid.js bindings with reactive primitives:
  - `RouterProvider`, `Link`, `RouteView` components
  - `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` hooks
  - Built on Solid.js signals for fine-grained reactivity (no re-renders)
  - Automatic cleanup via Solid's reactive scope
  - Single entry point

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `use:link` directive for navigation on any DOM element ([#327](https://github.com/greydragon888/real-router/issues/327))

  New `link` directive that turns any element into a router link with active class tracking, href on `<a>` elements, a11y attributes, and `shouldNavigate` checks.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouteStore()` and `useRouteNodeStore()` for granular property-level reactivity ([#326](https://github.com/greydragon888/real-router/issues/326))

  New store-based hooks using `createStore` + `reconcile` from `solid-js/store`. Components reading specific nested properties (e.g., `state.route?.params.id`) only re-run when those properties change — not on every navigation.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, matched content is automatically wrapped in `<Suspense>` from `solid-js`.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` moved from local code into shared private `dom-utils` package.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize active route detection with `createSelector` for O(1) updates ([#328](https://github.com/greydragon888/real-router/issues/328))

  `Link` components now use a shared `createSelector` from `RouterProvider` instead of per-link subscriptions. On navigation, only the previously-active and newly-active links update — all other links skip computation entirely.

### @real-router/svelte@0.1.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```svelte
  <RouterProvider {router} announceNavigation>
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/svelte` — Svelte 5 integration for Real-Router ([#292](https://github.com/greydragon888/real-router/issues/292))

  New package providing Svelte 5 bindings with composables and components:
  - `RouterProvider`, `Link`, `RouteView` components with snippets support
  - `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` composables
  - `createReactiveSource` primitive using `createSubscriber` for reactive state
  - Pure TypeScript implementation using Svelte 5 runes
  - Automatic cleanup via Svelte's lifecycle
  - Single entry point

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `Lazy` component for code-splitting support ([#325](https://github.com/greydragon888/real-router/issues/325))

  New `<Lazy>` component for lazy-loading route content with a fallback while loading. Accepts `loader` (dynamic import function) and optional `fallback` (component to show while loading).

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createLinkAction` for navigation on any DOM element ([#331](https://github.com/greydragon888/real-router/issues/331))

  New action factory that adds navigation behavior with `shouldNavigate` checks, a11y attributes, Enter key support, and parameter updates.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Export `createReactiveSource` as public API ([#332](https://github.com/greydragon888/real-router/issues/332))

  The central subscription primitive is now a public building block for creating custom reactive bindings from any `RouterSource<T>`.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` moved from local code into shared private `dom-utils` package.

### @real-router/vue@0.1.0

### Minor Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `announceNavigation` prop to RouterProvider ([#337](https://github.com/greydragon888/real-router/issues/337))

  WCAG-compliant screen reader announcements on route change. When enabled, a visually hidden `aria-live="assertive"` region announces each navigation, and focus moves to the first `<h1>` on the new page.

  ```ts
  h(RouterProvider, { router, announceNavigation: true }, () => [...])
  ```

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/vue` — Vue 3 integration for Real-Router ([#291](https://github.com/greydragon888/real-router/issues/291))

  New package providing Vue 3 bindings with composables and components:
  - `RouterProvider`, `Link`, `RouteView` components with `keepAlive` support
  - `useRouter`, `useRoute`, `useRouteNode`, `useNavigator`, `useRouteUtils`, `useRouterTransition` composables
  - Pure TypeScript implementation using `defineComponent` and `h()`
  - Automatic cleanup via Vue's lifecycle hooks
  - Single entry point

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createRouterPlugin()` for `app.use()` installation ([#329](https://github.com/greydragon888/real-router/issues/329))

  New Vue Plugin factory as an alternative to `<RouterProvider>`. Enables the standard `app.use(createRouterPlugin(router))` pattern.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `fallback` prop to `RouteView.Match` for Suspense support ([#325](https://github.com/greydragon888/real-router/issues/325))

  When `fallback` is provided, matched content is automatically wrapped in Vue's `<Suspense>`. Works with both `keepAlive` and non-keepAlive modes.

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `v-link` directive for navigation on any DOM element ([#330](https://github.com/greydragon888/real-router/issues/330))

  New `vLink` directive that adds navigation behavior with `shouldNavigate` checks, a11y attributes, Enter key support, and `cursor: pointer`.

### Patch Changes

- [#343](https://github.com/greydragon888/real-router/pull/343) [`042c10b`](https://github.com/greydragon888/real-router/commit/042c10b2f0383e9cf3c1fe71b1ad00965c1c4ccc) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract shared DOM utilities into dom-utils package ([#342](https://github.com/greydragon888/real-router/issues/342))

  Internal refactoring — no public API changes. `shouldNavigate`, `buildHref`, `buildActiveClassName`, `applyLinkA11y` moved from local code into shared private `dom-utils` package.

## [2026-03-18]

### @real-router/core@0.38.0

### Minor Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/core/utils` subpath with `serializeState()` ([#298](https://github.com/greydragon888/real-router/issues/298))

  New subpath export `@real-router/core/utils` with XSS-safe JSON serialization for embedding data in HTML `<script>` tags during SSR.

  ```typescript
  import { serializeState } from "@real-router/core/utils";

  const json = serializeState(data);
  const html = `<script>window.__STATE__=${json}</script>`;
  ```

  Escapes `<`, `>`, and `&` to Unicode equivalents to prevent `</script>` injection.

### @real-router/ssr-data-plugin@0.1.0

### Minor Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/ssr-data-plugin` — SSR per-route data loading ([#298](https://github.com/greydragon888/real-router/issues/298))

  New plugin that intercepts `start()` to load per-route data before server rendering. Data is stored in a `WeakMap<State, unknown>` and accessible via `router.getRouteData()`.

  ```typescript
  import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

  router.usePlugin(
    ssrDataPluginFactory({
      "users.profile": async (params) => fetchUser(params.id),
    }),
  );

  const state = await router.start(url);
  const data = router.getRouteData();
  ```

  SSR-only by design — does not intercept `navigate()`.

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

### @real-router/browser-plugin@0.10.3

### Patch Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `GuardFnFactory` signature in README example ([#298](https://github.com/greydragon888/real-router/issues/298))

  Guard factory receives `(router, getDep)`, not `()`. Updated deactivate guard example to show correct signature.

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

### @real-router/hash-plugin@0.2.3

### Patch Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `GuardFnFactory` signature in README example ([#298](https://github.com/greydragon888/real-router/issues/298))

  Guard factory receives `(router, getDep)`, not `()`. Updated deactivate guard example to show correct signature.

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

### @real-router/logger-plugin@0.3.3

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

### @real-router/persistent-params-plugin@0.1.42

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

### @real-router/react@0.12.4

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0
  - @real-router/sources@0.2.5

### @real-router/rx@0.1.30

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0

### @real-router/sources@0.2.5

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0


### @real-router/core@0.37.0

### Minor Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `getRouteConfig` from `getRoutesApi` to `getPluginApi` ([#320](https://github.com/greydragon888/real-router/issues/320))

  **Breaking Change:** `getRouteConfig()` is no longer available on the object returned by `getRoutesApi(router)`. Use `getPluginApi(router).getRouteConfig(routeName)` instead.

  `getRouteConfig` reads custom route config fields — a tool for **plugins**, not for route CRUD operations. Moving it to `getPluginApi` reflects its actual purpose: enabling config-driven plugins that read `title`, `loadData`, and other custom fields from route definitions.

  **Migration:**

  ```diff
  - import { getRoutesApi } from "@real-router/core/api";
  - const config = getRoutesApi(router).getRouteConfig("users");
  + import { getPluginApi } from "@real-router/core/api";
  + const config = getPluginApi(router).getRouteConfig("users");
  ```

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: unified structure with npm/bundlejs badges, compact API tables, tree-shakeable API section with `getRouteConfig` in `getPluginApi`. ARCHITECTURE: reduced from 983 to 430 lines — removed API reference (now in README/wiki), added Boundaries, fixed FIFO→LIFO, added stress test coverage table.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/fsm@0.2.2
  - @real-router/logger@0.2.1
  - @real-router/types@0.24.0

### @real-router/types@0.24.0

### Minor Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `getRouteConfig` type from `RoutesApi` to `PluginApi` interface ([#320](https://github.com/greydragon888/real-router/issues/320))

  **Breaking Change:** `getRouteConfig` method signature removed from `RoutesApi` interface and added to `PluginApi` interface. Consumers typing against these interfaces must update accordingly.

### @real-router/browser-plugin@0.10.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and fix ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, Router Extensions table, `buildUrl` vs `buildPath` comparison, SSR support section. ARCHITECTURE: fixed FIFO→LIFO interceptor order, added stress test coverage table.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

### @real-router/fsm@0.2.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: rewritten as internal package style — Purpose, Consumers, Key Design Decisions. ARCHITECTURE: added `forceState()` documentation — architecturally significant method for router's navigate hot path.

### @real-router/hash-plugin@0.2.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, Router Extensions table, `buildUrl` vs `buildPath` comparison, Form Protection and SSR sections. Unified structure with browser-plugin README.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

### @real-router/logger@0.2.1

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, API table, log levels matrix, Sentry and React Native use case examples.

### @real-router/logger-plugin@0.3.2

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and trim ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, console output preview, log levels matrix table. ARCHITECTURE: removed Public API section (now in README).

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

### @real-router/persistent-params-plugin@0.1.41

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, problem/solution example as hero, compact behavior section, UTM tracking and multilingual use cases.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

### @real-router/react@0.12.3

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, hooks table with re-render behavior, `useNavigator` added, React 18 migration section. ARCHITECTURE: added `useRouterTransition` to codemap and subscription patterns, added performance test coverage table, removed stale Pending Changes section.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0
  - @real-router/route-utils@0.1.5
  - @real-router/sources@0.2.4

### @real-router/route-utils@0.1.5

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README ([#320](https://github.com/greydragon888/real-router/issues/320))

  Added badges, RouteUtils and Segment Testers tables, fixed curried `startsWithSegment` example, performance complexity table.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/types@0.24.0

### @real-router/rx@0.1.29

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and trim ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, streams and operators tables, pipe example in Quick Start. ARCHITECTURE: removed 103-line Public API section (TypeScript signatures now in README).

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0

### @real-router/sources@0.2.4

### Patch Changes

- [#321](https://github.com/greydragon888/real-router/pull/321) [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2) Thanks [@greydragon888](https://github.com/greydragon888)! - Rewrite README and update ARCHITECTURE.md ([#320](https://github.com/greydragon888/real-router/issues/320))

  README: added badges, source factories table with lazy/eager info, transition tracking example. ARCHITECTURE: added `createTransitionSource` to codemap, types, and test coverage list.

- Updated dependencies [[`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2), [`6d17481`](https://github.com/greydragon888/real-router/commit/6d17481a3240e041e4c5d5d12c2922744fd447d2)]:
  - @real-router/core@0.37.0
  - @real-router/route-utils@0.1.5

## [2026-03-16]

### @real-router/core@0.36.2

### Patch Changes

- [#316](https://github.com/greydragon888/real-router/pull/316) [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize navigate() — 6x speedup, 5x fewer allocations ([#307](https://github.com/greydragon888/real-router/issues/307))

  Optimistic sync execution eliminates async overhead when no guards are registered.
  Systematic allocation reduction across the navigate pipeline: merged state construction,
  single-pass freeze chain, cached error paths, segment array reuse, FSM dispatch bypass.
  Guard pipeline refactored from three-function coroutine to flat loop with zero sync-path regression.

- Updated dependencies [[`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836), [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836)]:
  - @real-router/fsm@0.2.1
  - @real-router/types@0.23.1

### @real-router/fsm@0.2.1

### Patch Changes

- [#316](https://github.com/greydragon888/real-router/pull/316) [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize FSM for navigate hot path ([#307](https://github.com/greydragon888/real-router/issues/307))

  Replace `...args` rest parameter with optional `payload?` in `send()` to eliminate V8 array allocation.
  Add `forceState()` method for direct state transitions bypassing dispatch overhead.
  Use nested Map for transition lookups instead of template literal key concatenation.

### @real-router/types@0.23.1

### Patch Changes

- [#316](https://github.com/greydragon888/real-router/pull/316) [`88397c6`](https://github.com/greydragon888/real-router/commit/88397c66270a0612636df759b7e56a55a0b51836) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `NavigationContext` interface ([#307](https://github.com/greydragon888/real-router/issues/307))

  New internal interface shared across NavigationNamespace, guard pipeline, and transition completion modules.

## [2026-03-14]

### @real-router/core@0.36.1

### Patch Changes

- [#309](https://github.com/greydragon888/real-router/pull/309) [`ac442b7`](https://github.com/greydragon888/real-router/commit/ac442b7813339946839a77012e1709866b2c6c77) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix reentrant `navigate()` in event listener wiping `#currentToState` ([#308](https://github.com/greydragon888/real-router/issues/308))

  `sendComplete()`, `sendFail()`, and `sendCancel()` now use reentrancy-aware cleanup: `#currentToState` is only cleared if no reentrant `navigate()` set a new value during `fsm.send()`. Prevents `undefined` being passed as `toState` to `TRANSITION_CANCEL` listeners when `router.stop()` is called after a reentrant navigation with async guards.

## [2026-03-13]

### @real-router/react@0.12.2

### Patch Changes

- [#305](https://github.com/greydragon888/real-router/pull/305) [`ab5d8f5`](https://github.com/greydragon888/real-router/commit/ab5d8f5b27c7901632645c53367b5e42e5e765cf) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `use()` with `useContext()` in hooks for React 18 compatibility ([#288](https://github.com/greydragon888/real-router/issues/288))

  `useRouter`, `useRoute`, and `useNavigator` used React 19's `use()` API, breaking the `@real-router/react/legacy` entry point on React 18. Replaced with `useContext()` which is available in both React 18 and 19.


### @real-router/core@0.36.0

### Minor Changes

- [#303](https://github.com/greydragon888/real-router/pull/303) [`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c) Thanks [@greydragon888](https://github.com/greydragon888)! - Move standalone API getters to `@real-router/core/api` subpath export ([#297](https://github.com/greydragon888/real-router/issues/297))

  **Breaking Change:** `getPluginApi`, `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `cloneRouter` and types `PluginApi`, `RoutesApi`, `DependenciesApi`, `LifecycleApi` are no longer exported from `@real-router/core`.

  **Migration:**

  ```diff
  - import { createRouter, getPluginApi } from "@real-router/core";
  - import type { Router, PluginApi } from "@real-router/core";
  + import { createRouter } from "@real-router/core";
  + import { getPluginApi } from "@real-router/core/api";
  + import type { Router } from "@real-router/core";
  + import type { PluginApi } from "@real-router/core/api";
  ```

### @real-router/browser-plugin@0.10.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

### @real-router/hash-plugin@0.2.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

### @real-router/logger-plugin@0.3.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

### @real-router/persistent-params-plugin@0.1.40

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

### @real-router/react@0.12.1

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0
  - @real-router/sources@0.2.3

### @real-router/rx@0.1.28

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0

### @real-router/sources@0.2.3

### Patch Changes

- Updated dependencies [[`966bed6`](https://github.com/greydragon888/real-router/commit/966bed67e5f7fcc9c419a2d8e30e9c097fe8061c)]:
  - @real-router/core@0.36.0


### @real-router/sources@0.2.2

### Patch Changes

- [#301](https://github.com/greydragon888/real-router/pull/301) [`830df9a`](https://github.com/greydragon888/real-router/commit/830df9ade36273df81acaef74926c7f4e9eacc0b) Thanks [@greydragon888](https://github.com/greydragon888)! - Deduplicate all source implementations via `BaseSource` composition ([#287](https://github.com/greydragon888/real-router/issues/287))

  Replaced all 4 wrapper classes (`RouteSource`, `RouteNodeSource`, `ActiveRouteSource`, `TransitionSource`) with factory functions that compose `BaseSource` directly. Added `onFirstSubscribe`/`onLastUnsubscribe`/`onDestroy` lifecycle hooks and auto-bound methods to `BaseSource`, eliminating all jscpd-reported code clones in the package.


### @real-router/react@0.12.0

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

## [2026-03-10]

### @real-router/react@0.11.0

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


### @real-router/core@0.35.2

### Patch Changes

- [#278](https://github.com/greydragon888/real-router/pull/278) [`e826769`](https://github.com/greydragon888/real-router/commit/e82676983e5711a73e115e7e19e0833556a18a4a) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache `getNavigator()` result per router via `WeakMap` ([#271](https://github.com/greydragon888/real-router/issues/271))

  `getNavigator()` no longer allocates a new frozen object on every call. A module-level `WeakMap<Router, Navigator>` cache ensures one navigator per router instance. `WeakMap` does not prevent garbage collection of the router.


### @real-router/sources@0.2.1

### Patch Changes

- [#276](https://github.com/greydragon888/real-router/pull/276) [`7faf4c2`](https://github.com/greydragon888/real-router/commit/7faf4c24189b7f21c4c309503000e13317ffc01a) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `RouteNodeSource` leaking router subscriptions on unmount ([#270](https://github.com/greydragon888/real-router/issues/270))

  Converted `RouteNodeSource` from eager to lazy-connection pattern: the router subscription is now created on the first listener and removed when the last listener unsubscribes. Snapshot is reconciled with current router state on reconnection to handle Activity hide/show cycles. `destroy()` remains available but is no longer required.


### @real-router/react@0.10.0

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


### @real-router/react@0.9.0

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


### @real-router/react@0.8.0

### Minor Changes

- [#268](https://github.com/greydragon888/real-router/pull/268) [`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `useRouterTransition` hook ([#259](https://github.com/greydragon888/real-router/issues/259))

  New hook for tracking router transition state. Returns `RouterTransitionSnapshot`
  with `isTransitioning`, `toRoute`, and `fromRoute`. Useful for progress bars,
  loading overlays, and disabling navigation during async guards.

  Available in both entry points (`@real-router/react` and `@real-router/react/legacy`).

### Patch Changes

- Updated dependencies [[`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358)]:
  - @real-router/sources@0.2.0

### @real-router/sources@0.2.0

### Minor Changes

- [#268](https://github.com/greydragon888/real-router/pull/268) [`c6955b9`](https://github.com/greydragon888/real-router/commit/c6955b9f0b67939ba3983855290246960482d358) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `createTransitionSource` for transition lifecycle subscriptions ([#259](https://github.com/greydragon888/real-router/issues/259))

  New source that tracks router transition state (start/success/error/cancel)
  via `getPluginApi().addEventListener()`. Provides `RouterTransitionSnapshot`
  with `isTransitioning`, `toRoute`, and `fromRoute`.

  Dependency change: `@real-router/core` replaces `@real-router/types`.


### @real-router/react@0.7.0

### Minor Changes

- [#266](https://github.com/greydragon888/real-router/pull/266) [`9c759cb`](https://github.com/greydragon888/real-router/commit/9c759cbafb1334e10d4987bf48b0fb3165dafb73) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Consolidate Link components — remove `BaseLink` and `ConnectedLink` ([#258](https://github.com/greydragon888/real-router/issues/258))
  - `Link` now subscribes to active state via `useIsActiveRoute` — re-renders only when its own active status changes
  - `BaseLink` removed — `Link` takes router from context automatically
  - `ConnectedLink` removed — `Link` provides the same granular reactivity with less overhead
  - `BaseLinkProps` type replaced by `LinkProps<P>`
  - Removed: `data-route` and `data-active` HTML attributes
  - Fix: `routeOptions` (reload, replace) now correctly passed to navigation (previously silently dropped by `Link` and `ConnectedLink`)


### @real-router/react@0.6.0

### Minor Changes

- [#263](https://github.com/greydragon888/real-router/pull/263) [`7cdb227`](https://github.com/greydragon888/real-router/commit/7cdb2271f765a1839efc3e1fe6f1a20301ded408) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `./legacy` subpath export for React 18+ compatibility ([#257](https://github.com/greydragon888/real-router/issues/257))

  **BREAKING:** Main entry point (`@real-router/react`) now targets React 19.2+. React 18 users must switch to the legacy entry.

  **Migration:**

  ```diff
  - import { RouterProvider, useRouteNode, Link } from '@real-router/react';
  + import { RouterProvider, useRouteNode, Link } from '@real-router/react/legacy';
  ```

  Both entry points share the same code and export the same API. The `/legacy` entry excludes future React 19.2-only components (e.g., `ActivityRouteNode`).

## [2026-03-08]

### @real-router/logger-plugin@0.3.0

### Minor Changes

- [#251](https://github.com/greydragon888/real-router/pull/251) [`7ec0fdf`](https://github.com/greydragon888/real-router/commit/7ec0fdfbf3d815c4fafe9599c70d8ffa7d54c4e7) Thanks [@greydragon888](https://github.com/greydragon888)! - Align logger-plugin with plugin architecture conventions ([#250](https://github.com/greydragon888/real-router/issues/250))

  **BREAKING CHANGE:** Removed `loggerPlugin` singleton export. Use `loggerPluginFactory()` instead.

  **Migration:**

  ```diff
  - import { loggerPlugin } from "@real-router/logger-plugin";
  - router.usePlugin(loggerPlugin);
  + import { loggerPluginFactory } from "@real-router/logger-plugin";
  + router.usePlugin(loggerPluginFactory());
  ```

  Internal changes: converted closure to `LoggerPlugin` class with `getPlugin()` pattern, extracted factory.ts, added options validation, added LOGGER_CONTEXT/ERROR_PREFIX constants, fixed stale path comments.


### @real-router/persistent-params-plugin@0.1.39

### Patch Changes

- [#248](https://github.com/greydragon888/real-router/pull/248) [`fec1640`](https://github.com/greydragon888/real-router/commit/fec16407675ed5d9062c507e4ec2c05d1f9bf353) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internals to align with browser-plugin architecture ([#247](https://github.com/greydragon888/real-router/issues/247))
  - Extract `LOGGER_CONTEXT` and `ERROR_PREFIX` into `constants.ts`
  - Move initialization (param parsing, Set/freeze) from closure to factory level
  - Move side effects (`setRootPath`, `addInterceptor`) from `getPlugin()` to constructor with rollback on partial failure
  - Simplify teardown: remove global try/catch, wrap only `setRootPath` (throws during `router.dispose()`)
  - Remove duplicate `extractOwnParams` call from `mergeParams`
  - Add typed noop pattern (`EMPTY_PLUGIN`) for empty config
  - Fix `export { PersistentParamsConfig }` → `export type { PersistentParamsConfig }`
  - Add unit tests for `extractOwnParams` and `mergeParams`


### @real-router/core@0.35.1

### Patch Changes

- [#245](https://github.com/greydragon888/real-router/pull/245) [`5d00dd5`](https://github.com/greydragon888/real-router/commit/5d00dd52894687ac884a625a450e6c8ad8b989ff) Thanks [@greydragon888](https://github.com/greydragon888)! - Simplify error routing and consolidate namespace DI ([#244](https://github.com/greydragon888/real-router/issues/244))

  Internal refactoring with no public API changes:
  - Merge `sendTransitionBlocked` + `sendTransitionError` into single `sendTransitionFail`
  - Apply `send*`/`emit*` naming convention to EventBusNamespace methods
  - Eliminate `TransitionDependencies` interface, merge into `NavigationDependencies`
  - Replace `setRouter()` + `getDependency` with `compileFactory` in RouteLifecycle and Plugins namespaces
  - Extract `throwIfDisposed` to shared `api/helpers.ts`
  - Move guard-checking loop from `Router.canNavigateTo()` to `RouteLifecycleNamespace.canNavigateTo()`
  - Merge `resolveDefaultRoute` + `resolveDefaultParams` into `resolveDefault()`

- [#245](https://github.com/greydragon888/real-router/pull/245) [`5d00dd5`](https://github.com/greydragon888/real-router/commit/5d00dd52894687ac884a625a450e6c8ad8b989ff) Thanks [@greydragon888](https://github.com/greydragon888)! - Abort in-flight transition when `navigateToNotFound()` is called ([#244](https://github.com/greydragon888/real-router/issues/244))

  Previously, calling `navigateToNotFound()` during an active async transition left two concurrent state mutations racing against each other. Now `navigateToNotFound()` aborts the in-flight transition via `AbortController` and sends FSM CANCEL event before setting state.


### @real-router/core@0.35.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `navigateToNotFound()` method and export `UNKNOWN_ROUTE` constant ([#241](https://github.com/greydragon888/real-router/issues/241))

  New synchronous `router.navigateToNotFound(path?: string): State` method that replaces the current state with `UNKNOWN_ROUTE` without changing the URL. Emits a transition success event with full transition metadata (deactivated/activated segments) for contextual 404 pages.

  ```typescript
  import { UNKNOWN_ROUTE } from "@real-router/core";

  const state = router.navigateToNotFound("/missing-page");
  // state.name === UNKNOWN_ROUTE
  // state.path === "/missing-page"
  // state.params === {}
  // state.transition.segments.deactivated — previously active segments
  ```

  **Breaking Change:** `start()` with an unknown path now produces `state.params === {}` instead of `state.params === { path: "/..." }`. The path is available via `state.path`.

### Patch Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Eliminate cyclic wiring by delegating `start()` to `navigate()` ([#241](https://github.com/greydragon888/real-router/issues/241))

  Internal refactoring: `RouterLifecycleNamespace.start()` now calls `deps.navigate()` instead of directly invoking `navigateToState()`. This removes `wireCyclicDeps()` entirely, moves `setCanNavigate` into `wireNavigationDeps()`, and extracts `buildSuccessState`, `stripSignal`, and `routeTransitionError` to standalone functions. Adds `fromState &&` fast-path guard in `navigate()` to skip `areStatesEqual` on first navigation.

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0

### @real-router/browser-plugin@0.10.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `navigateToNotFound()` on popstate when `allowNotFound` is enabled ([#241](https://github.com/greydragon888/real-router/issues/241))

  When `allowNotFound: true` and a popstate event resolves to an unknown route, the plugin now calls `router.navigateToNotFound()` instead of `router.navigateToDefault()`, preserving the unmatched URL for contextual 404 pages.

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

### @real-router/hash-plugin@0.2.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Use `navigateToNotFound()` on popstate when `allowNotFound` is enabled ([#241](https://github.com/greydragon888/real-router/issues/241))

  When `allowNotFound: true` and a popstate event resolves to an unknown route, the plugin now calls `router.navigateToNotFound()` instead of `router.navigateToDefault()`, preserving the unmatched hash URL for contextual 404 pages.

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

### @real-router/types@0.23.0

### Minor Changes

- [#242](https://github.com/greydragon888/real-router/pull/242) [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `navigateToNotFound` to `Router` interface ([#241](https://github.com/greydragon888/real-router/issues/241))

  New method signature: `navigateToNotFound(path?: string): State`.

### @real-router/logger-plugin@0.2.39

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

### @real-router/persistent-params-plugin@0.1.38

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

### @real-router/react@0.5.5

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0
  - @real-router/sources@0.1.4
  - @real-router/route-utils@0.1.4

### @real-router/route-utils@0.1.4

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0

### @real-router/rx@0.1.27

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f), [`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/core@0.35.0

### @real-router/sources@0.1.4

### Patch Changes

- Updated dependencies [[`039b6f9`](https://github.com/greydragon888/real-router/commit/039b6f99b75207a59182bf7d1f8a65b8497a539f)]:
  - @real-router/types@0.23.0
  - @real-router/route-utils@0.1.4

## [2026-03-07]

### @real-router/core@0.34.1

### Patch Changes

- [#239](https://github.com/greydragon888/real-router/pull/239) [`4f20885`](https://github.com/greydragon888/real-router/commit/4f20885cb9b07c67848c45c79f5624e079cb9f42) Thanks [@greydragon888](https://github.com/greydragon888)! - Block public API mutations on internal `@@`-prefixed routes ([#238](https://github.com/greydragon888/real-router/issues/238))

  Routes with the `@@` prefix (e.g. `@@router/UNKNOWN_ROUTE`) are reserved for internal use. Previously, `validateRouteName` bypassed all validation for `@@` names, allowing users to add, remove, update, or replace system routes through the public API.

  Added `throwIfInternalRoute` and `throwIfInternalRouteInArray` validators that throw when CRUD operations target `@@`-prefixed routes. Read operations and guard registration remain allowed. `noValidate: true` bypasses the check for internal callers.

## [2026-03-06]

### @real-router/browser-plugin@0.9.0

### Minor Changes

- [#235](https://github.com/greydragon888/real-router/pull/235) [`9bf5901`](https://github.com/greydragon888/real-router/commit/9bf5901a2ff8ff51428ef15cc90cfd8159b9a379) Thanks [@greydragon888](https://github.com/greydragon888)! - BREAKING: Remove hash routing mode (#234)

  Use `@real-router/hash-plugin` for hash-based routing.
  - Remove `useHash`, `hashPrefix`, `preserveHash` options
  - `BrowserPluginOptions` is now `{ forceDeactivate?, base? }`
  - URL hash fragment (`#section`) is always preserved during navigation
  - Invalid option types now throw `Error` instead of warning and falling back to defaults

### @real-router/hash-plugin@0.1.0

### Minor Changes

- [#235](https://github.com/greydragon888/real-router/pull/235) [`9bf5901`](https://github.com/greydragon888/real-router/commit/9bf5901a2ff8ff51428ef15cc90cfd8159b9a379) Thanks [@greydragon888](https://github.com/greydragon888)! - Standalone hash-based routing plugin (#234)

  New `@real-router/hash-plugin` package for hash-based routing (`example.com/#/path`).

  ```typescript
  import { hashPluginFactory } from "@real-router/hash-plugin";

  router.usePlugin(hashPluginFactory({ hashPrefix: "!", base: "/app" }));
  ```

  - `hashPrefix` — character after `#` (default: `""`, e.g. `"!"` for `#!/path`)
  - `base` — base path prefix (default: `""`)
  - `forceDeactivate` — force deactivation on navigation (default: `false`)

## [2026-03-05]

### @real-router/browser-plugin@0.8.0

### Minor Changes

- [#232](https://github.com/greydragon888/real-router/pull/232) [`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate `browser-plugin` to use `extendRouter()` for formal router extension (#231)

  Replaces manual property assignment (`router.buildUrl = ...`) and deletion (`delete router.buildUrl`) with the new `extendRouter()` API. Extensions are now automatically cleaned up via the returned unsubscribe function in `teardown`.

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0

### @real-router/core@0.34.0

### Minor Changes

- [#232](https://github.com/greydragon888/real-router/pull/232) [`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b) Thanks [@greydragon888](https://github.com/greydragon888)! - Implement `extendRouter()` in `getPluginApi()` with conflict detection and dispose cleanup (#231)

  `getPluginApi(router).extendRouter(extensions)` adds properties to the router instance and returns an unsubscribe function that removes them. Throws `PLUGIN_CONFLICT` if any key already exists on the router. `router.dispose()` automatically cleans up any extensions that plugins failed to remove in their `teardown`.

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0

### @real-router/types@0.22.0

### Minor Changes

- [#232](https://github.com/greydragon888/real-router/pull/232) [`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `extendRouter()` to `PluginApi` interface and `PLUGIN_CONFLICT` error code (#231)

  New `extendRouter(extensions)` method on `PluginApi` allows plugins to formally extend the router instance with conflict detection. New `PLUGIN_CONFLICT` error code thrown when a plugin tries to register a property that already exists on the router.

### @real-router/logger-plugin@0.2.38

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0

### @real-router/persistent-params-plugin@0.1.37

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0

### @real-router/react@0.5.4

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0
  - @real-router/sources@0.1.3
  - @real-router/route-utils@0.1.3

### @real-router/route-utils@0.1.3

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0

### @real-router/rx@0.1.26

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/core@0.34.0

### @real-router/sources@0.1.3

### Patch Changes

- Updated dependencies [[`5613edb`](https://github.com/greydragon888/real-router/commit/5613edbce99253005ac921050f01e8d9ebec076b)]:
  - @real-router/types@0.22.0
  - @real-router/route-utils@0.1.3


### @real-router/browser-plugin@0.7.0

### Minor Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove legacy artifacts from Browser interface (#228)

  **BREAKING CHANGE:**
  - `mergeState` option removed from `BrowserPluginOptions`
  - `browser.getState()` removed from `Browser` interface
  - `pushState` / `replaceState` signature changed from `(state, title, path)` to `(state, path)`
  - `HistoryState` type removed
  - `isHistoryState` no longer re-exported
  - `router.lastKnownState` removed (use `router.getState()`)

### Patch Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor into class-based architecture with extracted URL utilities (#225)

  Internal refactoring: replaced monolithic factory closure with `BrowserPlugin` class, extracted URL logic into dedicated `url-utils` module, removed IE/Trident dead code, and simplified popstate handling to use `router.navigate()` through the full core pipeline.

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0

### @real-router/core@0.33.0

### Minor Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace per-method interceptor APIs with universal `addInterceptor` (#224)

  **BREAKING CHANGE:** `addBuildPathInterceptor`, `setForwardState`, and `getForwardState` have been replaced with a single `addInterceptor(method, fn)` API. New interceptable method `start` added for browser-plugin to call `router.start()` without arguments.

  **Migration:**

  ```diff
  - api.addBuildPathInterceptor(fn);
  + api.addInterceptor('buildPath', (next, route, params) => next(route, modifiedParams));

  - api.setForwardState(fn);
  + api.addInterceptor('forwardState', (next, name, params) => next(name, params));
  ```

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `navigateToState` from public `PluginApi` (#227)

  **BREAKING CHANGE:** `navigateToState` is no longer available in the plugin API. Plugins should use `router.navigate()` instead, which goes through the full navigation pipeline including middleware, guards, and interceptors.

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0

### @real-router/types@0.21.0

### Minor Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `InterceptableMethodMap` and `InterceptorFn` generic types (#224)

  New generic types for type-safe interceptor registration. `InterceptableMethodMap` maps interceptable method names to their argument types, and `InterceptorFn<M>` provides the correctly-typed interceptor function signature for each method.

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `navigateToState` from `PluginApi` interface (#227)

  **BREAKING CHANGE:** `navigateToState` has been removed from the `PluginApi` interface. Plugins should use `router.navigate()` instead.

### @real-router/logger-plugin@0.2.37

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0

### @real-router/persistent-params-plugin@0.1.36

### Patch Changes

- [#229](https://github.com/greydragon888/real-router/pull/229) [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor into class-based architecture (#226)

  Internal refactoring: replaced monolithic factory closure with `PersistentParamsPlugin` class, migrated from legacy per-method interceptors to `addInterceptor` API, removed dead code and monkey-patching relics.

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0

### @real-router/react@0.5.3

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0
  - @real-router/sources@0.1.2
  - @real-router/route-utils@0.1.2

### @real-router/route-utils@0.1.2

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0

### @real-router/rx@0.1.25

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/core@0.33.0

### @real-router/sources@0.1.2

### Patch Changes

- Updated dependencies [[`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d), [`95f681d`](https://github.com/greydragon888/real-router/commit/95f681d53b6948d18889e6082f39eb5d1f81fd4d)]:
  - @real-router/types@0.21.0
  - @real-router/route-utils@0.1.2

## [2026-03-04]

### @real-router/core@0.32.0

### Minor Changes

- [#221](https://github.com/greydragon888/real-router/pull/221) [`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `addBuildPathInterceptor` to `PluginApi` (#220)

  Plugins can now register buildPath param interceptors via `getPluginApi(router).addBuildPathInterceptor()`. Multiple interceptors execute in FIFO registration order. Each returns an `Unsubscribe` function for safe teardown.

  ```typescript
  const api = getPluginApi(router);
  const unsubscribe = api.addBuildPathInterceptor((routeName, params) => {
    return { ...params, lang: getCurrentLang() };
  });
  ```

  All `buildPath` call paths (facade, wiring, plugins) go through the interceptor pipeline via `RouterInternals`.

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0

### @real-router/types@0.20.0

### Minor Changes

- [#221](https://github.com/greydragon888/real-router/pull/221) [`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `addBuildPathInterceptor` to `PluginApi` interface (#220)

  New method on `PluginApi` allows plugins to register buildPath param interceptors:

  ```typescript
  addBuildPathInterceptor: (
    fn: (routeName: string, params: Params) => Params,
  ) => Unsubscribe;
  ```

### @real-router/browser-plugin@0.6.3

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0

### @real-router/logger-plugin@0.2.36

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0

### @real-router/persistent-params-plugin@0.1.35

### Patch Changes

- [#221](https://github.com/greydragon888/real-router/pull/221) [`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `buildPath` monkey patching with `addBuildPathInterceptor` (#220)

  Migrated from direct `router.buildPath = ...` override to `api.addBuildPathInterceptor()`. No public API changes — internal implementation only.

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0

### @real-router/react@0.5.2

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0
  - @real-router/sources@0.1.1
  - @real-router/route-utils@0.1.1

### @real-router/route-utils@0.1.1

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0

### @real-router/rx@0.1.24

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/core@0.32.0

### @real-router/sources@0.1.1

### Patch Changes

- Updated dependencies [[`ed81e5d`](https://github.com/greydragon888/real-router/commit/ed81e5d552b5ac8a76c7562b2479652636e5ef10)]:
  - @real-router/types@0.20.0
  - @real-router/route-utils@0.1.1


### @real-router/sources@0.1.0

### Minor Changes

- [#218](https://github.com/greydragon888/real-router/pull/218) [`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/sources` — framework-agnostic subscription layer for router state (#217)

  Three factory functions for UI adapter authors:
  - `createRouteStore(router)` — subscribe to all navigations
  - `createRouteNodeStore(router, nodeName)` — subscribe to specific route node
  - `createActiveRouteStore(router, routeName, params?, options?)` — track route activity

### @real-router/react@0.5.1

### Patch Changes

- [#218](https://github.com/greydragon888/real-router/pull/218) [`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor React hooks to use `@real-router/sources` (#217)

  Internal refactoring: `useRouteNode`, `useIsActiveRoute`, and `RouterProvider` now delegate
  subscription logic to `@real-router/sources`. No public API changes.

- Updated dependencies [[`72019f2`](https://github.com/greydragon888/real-router/commit/72019f282b6b4dc4ba8a15993e19ff0ee97e1df8)]:
  - @real-router/sources@0.1.0

## [2026-03-03]

### @real-router/core@0.31.0

### Minor Changes

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `nameToIDs` from public API (#214)

  **Breaking Change:** `nameToIDs` is no longer exported from `@real-router/core`.

  **Migration:** Use `RouteUtils.getChain()` from `@real-router/route-utils` instead:

  ```diff
  - import { nameToIDs } from "@real-router/core";
  - const chain = nameToIDs("users.profile");
  + import { getPluginApi } from "@real-router/core";
  + import { getRouteUtils } from "@real-router/route-utils";
  + const utils = getRouteUtils(getPluginApi(router).getTree());
  + const chain = utils.getChain("users.profile");
  ```

- [#215](https://github.com/greydragon888/real-router/pull/215) [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f) Thanks [@greydragon888](https://github.com/greydragon888)! - Override `PluginApi.getTree()` return type to `RouteTree` and re-export `RouteTree` (#214)

  `getPluginApi(router).getTree()` now returns properly typed `RouteTree` instead of `unknown`.
  `RouteTree` type is also re-exported from `@real-router/core` for convenience.

  This is a type-only change — no runtime behavior changed.

### @real-router/react@0.5.0

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

### @real-router/route-utils@0.1.0

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

### @real-router/browser-plugin@0.6.2

### Patch Changes

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0

### @real-router/logger-plugin@0.2.35

### Patch Changes

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0

### @real-router/persistent-params-plugin@0.1.34

### Patch Changes

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0

### @real-router/rx@0.1.23

### Patch Changes

- Updated dependencies [[`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f), [`3edf0a4`](https://github.com/greydragon888/real-router/commit/3edf0a45bed5baec8838989739d98668ce26c00f)]:
  - @real-router/core@0.31.0

## [2026-03-02]

### @real-router/core@0.30.0

### Minor Changes

- [#212](https://github.com/greydragon888/real-router/pull/212) [`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix `Router.start()` to suppress unhandled rejections for fire-and-forget usage, matching `navigate()` and `navigateToDefault()` behavior.
  Calling `void router.start(path)` is now safe and will not produce `UnhandledPromiseRejectionWarning` for expected errors (`TRANSITION_CANCELLED`, `ROUTE_NOT_FOUND`).
  Fixes #211.

### @real-router/browser-plugin@0.6.1

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0

### @real-router/helpers@0.1.34

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0

### @real-router/logger-plugin@0.2.34

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0

### @real-router/persistent-params-plugin@0.1.33

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0

### @real-router/react@0.4.12

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0
  - @real-router/helpers@0.1.34

### @real-router/rx@0.1.22

### Patch Changes

- Updated dependencies [[`94938c4`](https://github.com/greydragon888/real-router/commit/94938c4db1d617659e6f434859651ab8aaaf0cf3)]:
  - @real-router/core@0.30.0

## [2026-03-01]

### @real-router/browser-plugin@0.6.0

### Minor Changes

- [#203](https://github.com/greydragon888/real-router/pull/203) [`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `meta.options` from history state and popstate restoration (#202)

  **Breaking Change:** `state.meta.options` is no longer written to `history.state` or restored on popstate.

  Existing history entries with `meta.options` are not affected — extra fields are ignored on spread.

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0

### @real-router/core@0.29.0

### Minor Changes

- [#203](https://github.com/greydragon888/real-router/pull/203) [`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `State.meta.options` storage, move `reload`/`redirected` to `TransitionMeta` (#202)

  **Breaking Change:** Navigation options are no longer stored in `state.meta.options`.
  - `reload` and `redirected` flags are now available on `state.transition` after successful navigation
  - `transitionPath` accepts optional `opts` parameter for reload detection
  - `shouldUpdateNode` reads `reload` from `state.transition` instead of `state.meta.options`
  - Removed `EMPTY_OPTIONS` constant and `cleanOpts` helper

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/types@0.19.0

### @real-router/types@0.19.0

### Minor Changes

- [#203](https://github.com/greydragon888/real-router/pull/203) [`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `options` field from `StateMeta` type (#202)

  **Breaking Change:** `StateMeta` no longer includes `options: NavigationOptions` field.

  `TransitionMeta` extended with optional `reload` and `redirected` fields.

  **Migration:**

  ```diff
  - if (state.meta?.options?.redirected) { ... }
  + if (state.transition?.redirected) { ... }

  - if (state.meta?.options?.reload) { ... }
  + if (state.transition?.reload) { ... }
  ```

### @real-router/helpers@0.1.33

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0

### @real-router/logger-plugin@0.2.33

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0

### @real-router/persistent-params-plugin@0.1.32

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0

### @real-router/react@0.4.11

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0
  - @real-router/helpers@0.1.33

### @real-router/rx@0.1.21

### Patch Changes

- Updated dependencies [[`eb29a60`](https://github.com/greydragon888/real-router/commit/eb29a60637f6835152be85550e0fad368900a4ae)]:
  - @real-router/core@0.29.0


### @real-router/logger-plugin@0.2.32

### Patch Changes

- [#200](https://github.com/greydragon888/real-router/pull/200) [`d17021a`](https://github.com/greydragon888/real-router/commit/d17021a12047d27313b9c0dfc17ab48b6e3882b9) Thanks [@greydragon888](https://github.com/greydragon888)! - Eliminate redundant computations in logger-plugin (#199)

  Pre-compute immutable flags and prefix at initialization, cache transition label and perf mark name across handlers, extract shared `resetTransitionState()` cleanup, inline `getTiming()`, and replace `Object.entries()` with `Object.keys()` for emptiness checks in params-diff.

## [2026-02-28]

### @real-router/core@0.28.0

### Minor Changes

- [#196](https://github.com/greydragon888/real-router/pull/196) [`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `routesApi.replace()` for atomic route replacement (#195)

  Combines `clear + add` into a single operation with one tree rebuild, state preservation via `matchPath` revalidation, and selective guard cleanup (`isFromDefinition` tracking). Designed for HMR use cases.

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/types@0.18.0

### @real-router/types@0.18.0

### Minor Changes

- [#196](https://github.com/greydragon888/real-router/pull/196) [`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `replace()` method to `RoutesApi` interface (#195)

  New method for atomic route replacement (HMR support).

### @real-router/browser-plugin@0.5.5

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0

### @real-router/helpers@0.1.32

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0

### @real-router/logger-plugin@0.2.31

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0

### @real-router/persistent-params-plugin@0.1.31

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0

### @real-router/react@0.4.10

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0
  - @real-router/helpers@0.1.32

### @real-router/rx@0.1.20

### Patch Changes

- Updated dependencies [[`1141890`](https://github.com/greydragon888/real-router/commit/114189008eb3d42c3841b5d4b56aa10b26d19c1b)]:
  - @real-router/core@0.28.0


### @real-router/types@0.17.0

### Minor Changes

- [#192](https://github.com/greydragon888/real-router/pull/192) [`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `signal` field to `NavigationOptions` and `GuardFn` (#188)

  New optional `signal?: AbortSignal` field on `NavigationOptions` allows cancelling in-flight navigations via the standard `AbortController` API. Guards receive the signal as an optional third parameter.

  ```typescript
  const controller = new AbortController();
  router.navigate("users", {}, { signal: controller.signal });

  // Cancel the navigation
  controller.abort();
  ```

- [#192](https://github.com/greydragon888/real-router/pull/192) [`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove index signature from `NavigationOptions`, enforce strict fields only (#188)

  **BREAKING CHANGE:** `NavigationOptions` no longer accepts arbitrary keys. Only known fields (`replace`, `reload`, `force`, `forceDeactivate`, `redirected`, `signal`) are allowed.

  **Migration:**

  ```diff
  - router.navigate('route', {}, { replace: true, customKey: 'value' });
  + router.navigate('route', {}, { replace: true });
  ```

### @real-router/core@0.27.0

### Minor Changes

- [#192](https://github.com/greydragon888/real-router/pull/192) [`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097) Thanks [@greydragon888](https://github.com/greydragon888)! - Integrate AbortController API into `router.navigate()` (#188)

  Each navigation creates an internal `AbortController`. Pass an external `signal` via `NavigationOptions` to cancel navigations from userland:

  ```typescript
  const controller = new AbortController();

  const promise = router.navigate("users", {}, { signal: controller.signal });

  controller.abort(); // rejects with TRANSITION_CANCELLED
  ```

  Key behaviors:
  - Pre-aborted signal rejects immediately without starting a transition
  - Concurrent navigation aborts the previous navigation's signal
  - `router.stop()` and `router.dispose()` abort in-flight navigations
  - Guards receive `signal` as optional third parameter for cooperative cancellation
  - `AbortError` thrown in guards is auto-converted to `TRANSITION_CANCELLED`
  - Signal is stripped from `state.meta.options` (non-serializable)

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097), [`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/types@0.17.0

### @real-router/browser-plugin@0.5.4

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0

### @real-router/helpers@0.1.31

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0

### @real-router/logger-plugin@0.2.30

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0

### @real-router/persistent-params-plugin@0.1.30

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0

### @real-router/react@0.4.9

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0
  - @real-router/helpers@0.1.31

### @real-router/rx@0.1.19

### Patch Changes

- Updated dependencies [[`63647eb`](https://github.com/greydragon888/real-router/commit/63647eb81d13b5a9d54b7294685ce93c81bfc097)]:
  - @real-router/core@0.27.0

## [2026-02-27]

### @real-router/core@0.26.0

### Minor Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Switch `cloneRouter` to standalone via WeakMap and remove `CloneNamespace` from Router (#173)

  **Breaking Change:** `Router.clone()` instance method removed. Use `cloneRouter(router, deps?)` instead.

  **Removed:** `CloneNamespace` class (3 files), `Router.clone()` method, clone wiring in `RouterWiringBuilder`.

  **Migration:**

  ```diff
  - const cloned = router.clone({ api: newApi });
  + import { cloneRouter } from "@real-router/core";
  + const cloned = cloneRouter(router, { api: newApi });
  ```

  `cloneRouter` collects all router data (routes, options, dependencies, guards, plugins, forwardTo, rootPath, middleware) via WeakMap internals and creates a fresh router instance.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Switch `getDependenciesApi` to standalone via WeakMap and remove DI methods from Router (#172)

  **Breaking Change:** DI methods removed from the `Router` class. Use `getDependenciesApi(router)` instead.

  **Removed methods:** `setDependency`, `setDependencies`, `removeDependency`, `resetDependencies`, `hasDependency`, `getDependency`, `getDependencies`.

  **Migration:**

  ```diff
  - router.setDependency("api", apiService);
  - const dep = router.getDependency("api");
  + import { getDependenciesApi } from "@real-router/core";
  + const deps = getDependenciesApi(router);
  + deps.set("api", apiService);
  + const dep = deps.get("api");
  ```

  `getDependency` remains available internally via factory injection (`PluginFactory`, `GuardFnFactory`, `ForwardToCallback`).

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace `DependenciesNamespace` class with plain `DependenciesStore` and inline CRUD logic into `getDependenciesApi` (#187)

  **Breaking Change:** `RouterInternals` dependency entries replaced with single `dependenciesGetStore()` accessor. Plugins using `getInternals()` must migrate.

  **What changed:**
  - New `DependenciesStore<D>` interface — plain data object (`dependencies` + `limits`)
  - `DependenciesNamespace` class eliminated — `createDependenciesStore()` factory replaces `new DependenciesNamespace()`
  - CRUD logic (`set`, `setMultiple`, `checkDependencyCount`) moved into `getDependenciesApi.ts` as module-private functions
  - `RouterInternals` reduced from 9 `dependency*` entries + `maxDependencies` to one `dependenciesGetStore()`
  - Wiring accesses store directly (`dependenciesStore.dependencies[key]`) instead of class methods

  **Migration (plugins using `getInternals()`):**

  ```diff
    const ctx = getInternals(router);
  - const value = ctx.dependencyGet("myDep");
  - const all = ctx.dependencyGetAll();
  - ctx.dependencySet("myDep", value);
  - const count = ctx.dependencyCount();
  + const store = ctx.dependenciesGetStore();
  + const value = store.dependencies["myDep"];
  + const all = { ...store.dependencies };
  + store.dependencies["myDep"] = value;
  + const count = Object.keys(store.dependencies).length;
  ```

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Add factory functions and WeakMap internals for modular plugin access (#170, #171)

  **Breaking Change:** PluginApi methods removed from the `Router` class. Use `getPluginApi(router)` instead.

  **Removed methods:** `makeState`, `buildState`, `forwardState`, `matchPath`, `setRootPath`, `getRootPath`, `navigateToState`, `addEventListener`, `getOptions`.

  **Migration:**

  ```diff
  - const state = router.matchPath("/home");
  + import { getPluginApi } from "@real-router/core";
  + const api = getPluginApi(router);
  + const state = api.matchPath("/home");
  ```

  **New exports:**
  - `getPluginApi(router)` — returns `PluginApi` with `makeState`, `buildState`, `matchPath`, `navigateToState`, `addEventListener`, etc.
  - `getRoutesApi(router)` — returns `RoutesApi` with `add`, `remove`, `update`, `clear`, `has`
  - `getDependenciesApi(router)` — returns `DependenciesApi` with `get`, `set`, `remove`, `reset`, `has`, etc.
  - `cloneRouter(router, deps?)` — clones router for SSR

  Internally, `getPluginApi` uses a WeakMap-based internals mechanism for decoupled access to router state.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract guard management methods into `getLifecycleApi` (#183)

  **Breaking Change:** Guard registration methods removed from the `Router` class. Use `getLifecycleApi(router)` instead.

  **Removed methods:** `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard`.

  **Migration:**

  ```diff
  - router.addActivateGuard("admin", guardFactory);
  - router.removeActivateGuard("admin");
  + import { getLifecycleApi } from "@real-router/core";
  + const lifecycle = getLifecycleApi(router);
  + lifecycle.addActivateGuard("admin", guardFactory);
  + lifecycle.removeActivateGuard("admin");
  ```

  `canNavigateTo` remains on the Router class — it is a sync UI query method used in hot-path rendering.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Move `addEventListener` and `buildNavigationState` from Router to `getPluginApi()` (#182)

  **Breaking Change:** `router.addEventListener()` and `router.buildNavigationState()` are removed from the Router class. Use `getPluginApi(router)` instead.

  **Migration:**

  ```diff
  - router.addEventListener("transitionSuccess", handler);
  + import { getPluginApi } from "@real-router/core";
  + getPluginApi(router).addEventListener("transitionSuccess", handler);
  ```

  ```diff
  - const state = router.buildNavigationState("users", { id: "123" });
  + import { getPluginApi } from "@real-router/core";
  + const state = getPluginApi(router).buildNavigationState("users", { id: "123" });
  ```

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `ActivationFn` and `ActivationFnFactory` re-exports (#187)

  **Breaking Change:** `ActivationFn` and `ActivationFnFactory` are no longer exported. Use `GuardFn` and `GuardFnFactory` instead.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Switch `getRoutesApi` to standalone via WeakMap and remove Route CRUD methods from Router (#174)

  **Breaking Change:** Route CRUD methods removed from the `Router` class. Use `getRoutesApi(router)` instead.

  **Removed methods:** `addRoute`, `removeRoute`, `updateRoute`, `clearRoutes`, `getRoute`, `getRouteConfig`, `hasRoute`.

  **Migration:**

  ```diff
  - router.addRoute({ name: "users", path: "/users" });
  - router.removeRoute("users");
  + import { getRoutesApi } from "@real-router/core";
  + const routes = getRoutesApi(router);
  + routes.add({ name: "users", path: "/users" });
  + routes.remove("users");
  ```

  Internally, CRUD logic extracted from `RoutesNamespace` into standalone `routesCrud.ts` for tree-shaking — only included in the bundle when `getRoutesApi()` is imported. Static validator delegates removed from `RoutesNamespace` in favor of direct imports from `validators.ts`.

  Heavy operations (`commitTreeChanges`, `rebuildTreeInPlace`, `refreshForwardMap`, `registerAllRouteHandlers`, `nodeToDefinition`, `validateRoutes`) injected via `RoutesStore.ops` — breaks the static import chain `routesCrud.ts → routeTreeOps.ts → route-tree`, reducing `getRoutesApi` standalone bundle from 10.17 kB to 4.04 kB brotli (-60%).

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Introduce `RoutesStore`, consolidate clone internals and reduce `RouterInternals` surface (#180)

  **Breaking Change:** `RouterInternals` route-related entries replaced with single `routeGetStore()` accessor. Plugins using `getInternals()` must migrate.

  **What changed:**
  - New `RoutesStore<D>` interface — plain data object holding all route state (~13 fields previously spread across `RoutesNamespace` private properties)
  - `RoutesNamespace` now owns a single `#store: RoutesStore` instead of ~13 private fields and ~11 accessor methods
  - `RouterInternals` reduced from ~20 individual `route*` entries to one `routeGetStore()` — eliminates `RoutesDataContext` assembly boilerplate
  - `RouterInternals<D>` is now generic — removes `as unknown as` type casts in `cloneRouter`, `getRoutesApi`, `getDependenciesApi`
  - `cloneRouter()` operates directly on `RoutesStore` — removes `applyClonedConfig()`, `cloneRoutes()`, and related accessor methods
  - `getRoutesApi()` passes store directly instead of assembling `RoutesDataContext` per call

  **Migration (plugins using `getInternals()`):**

  ```diff
    const ctx = getInternals(router);
  - const tree = ctx.routeGetTree();
  - const definitions = ctx.routeDefinitions;
  - const config = ctx.routeConfig;
  - const matcher = ctx.routeGetMatcher();
  + const store = ctx.routeGetStore();
  + const tree = store.tree;
  + const definitions = store.definitions;
  + const config = store.config;
  + const matcher = store.matcher;
  ```

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Re-export consolidated types from `@real-router/types` (#184)
  - Replace factory type and route config definitions in `types.ts` with re-exports from `@real-router/types`
  - Replace API interface definitions in `api/types.ts` with re-exports
  - Standalone API functions (`getPluginApi`, `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getNavigator`) now accept `Router` interface instead of class — enables passing interface-typed router values
  - `PluginApi.getTree()` returns `unknown` (was `RouteTree`)

  All existing imports from `@real-router/core` continue working via re-exports.

### Patch Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Update documentation for modular architecture (#187)
  - **core/README.md**: Rewrite API reference — Promise-based navigation, standalone API functions (`getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getPluginApi`, `cloneRouter`), remove callback-based examples, add `dispose()`, update error codes
  - **ARCHITECTURE.md**: Update package dependency diagram, split internal packages (bundled vs separate), add standalone API section, update SSR example to `cloneRouter()`
  - **IMPLEMENTATION_NOTES.md**: Update namespace structure (Router.ts ~640 lines, `api/` folder, store pattern), add "Standalone API Extraction" section
  - **README.md**: Update React example (`useRouteNode` instead of `useRoute`)

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/types@0.16.0

### @real-router/types@0.16.0

### Minor Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `ActivationFn` and `ActivationFnFactory` types (#187)

  **Breaking Change:** `ActivationFn` and `ActivationFnFactory` types have been removed. Use `GuardFn` and `GuardFnFactory` instead — guards return `boolean | Promise<boolean>` only.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Consolidate Router-dependent types into `@real-router/types` (#184)
  - Expand `Router` interface from 6 to 15 methods, make generic `Router<D>`
  - Move factory types (`PluginFactory`, `GuardFnFactory`, `ActivationFnFactory`) from `@real-router/core` using interface self-reference
  - Move route config types (`Route`, `RouteConfigUpdate`) from `@real-router/core`
  - Add `EventMethodMap` type-level computation to constants
  - Add API interfaces (`PluginApi`, `RoutesApi`, `DependenciesApi`, `LifecycleApi`) in new `api.ts`

  All types are now importable from `@real-router/types` without depending on `@real-router/core`.

### @real-router/browser-plugin@0.5.3

### Patch Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate internal PluginApi usage to `getPluginApi()` (#170)

  Replaced direct `router.*` PluginApi calls with `api.*` via `getPluginApi(router)` for decoupled plugin architecture. No public API changes.

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Adapt plugin function to `PluginFactory` interface change (#184)

  Internal: plugin function parameter now inferred from `PluginFactory` (Router interface) instead of annotated with Router class. Cast to augmented Router for browser-specific properties.

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0

### @real-router/helpers@0.1.30

### Patch Changes

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0

### @real-router/logger-plugin@0.2.29

### Patch Changes

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0

### @real-router/persistent-params-plugin@0.1.29

### Patch Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate internal PluginApi usage to `getPluginApi()` (#170, #171)

  Replaced direct `router.forwardState` monkey-patching with `api.getForwardState()` / `api.setForwardState()` via `getPluginApi(router)` for decoupled plugin architecture. No public API changes.

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0

### @real-router/react@0.4.8

### Patch Changes

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0
  - @real-router/helpers@0.1.30

### @real-router/rx@0.1.18

### Patch Changes

- [#187](https://github.com/greydragon888/real-router/pull/187) [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate internal PluginApi usage to `getPluginApi()` (#170)

  Replaced direct `router.*` PluginApi calls with `api.*` via `getPluginApi(router)` for decoupled plugin architecture. No public API changes.

- Updated dependencies [[`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb), [`d31e86b`](https://github.com/greydragon888/real-router/commit/d31e86ba5400d369fcaa48fd4d6e4433e4e063eb)]:
  - @real-router/core@0.26.0

## [2026-02-23]

### @real-router/cache-manager@0.2.1

### Patch Changes

- [#167](https://github.com/greydragon888/real-router/pull/167) [`649c251`](https://github.com/greydragon888/real-router/commit/649c251af331b2b2986c7b8781969904122673dc) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace LRU with FIFO eviction in KeyIndexCache (#165)

  FIFO eliminates `Map.delete()` + `Map.set()` on every cache hit (LRU refresh).
  Hit path is now a single `Map.get()` — 2–3.4× faster than LRU in benchmarks.

  Other optimizations:
  - Inline `#store()` into `get()` (one fewer function call on miss)
  - Replace `#stats` object with separate `#hits`/`#misses` counters (no object allocation on `clear()`)
  - Handle `undefined` as a valid cached value (disambiguate from cache miss)


### @real-router/cache-manager@0.2.0

### Minor Changes

- [#164](https://github.com/greydragon888/real-router/pull/164) [`9143703`](https://github.com/greydragon888/real-router/commit/91437035286276402aad3a3cde86b4eb8253063d) Thanks [@greydragon888](https://github.com/greydragon888)! - Create `@real-router/cache-manager` package (#158)

  Centralized cache registry with LRU eviction for real-router. Exports two primitives:
  - **`KeyIndexCache<T>`** — generic LRU cache (`get`, `invalidateMatching`, `getMetrics`, `clear`)
  - **`CacheManager`** — dynamic registry of `KeyIndexCache` instances with coordinated invalidation and aggregated metrics
  - **`cacheManager`** — module-level singleton (same pattern as `@real-router/logger`)

## [2026-02-22]

### @real-router/helpers@0.1.29

### Patch Changes

- [#156](https://github.com/greydragon888/real-router/pull/156) [`57bc77d`](https://github.com/greydragon888/real-router/commit/57bc77dd783fa75c00f7c58c2c2606392d036a50) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache compiled RegExp in segment tester functions (#147)

  Add per-tester `Map<string, RegExp>` cache inside `makeSegmentTester` so that repeated calls with the same segment string reuse the compiled regex instead of creating a new one each time. Typical improvement: ×15–23 faster, ×17–5,316 less heap on repeated segment checks.


### @real-router/core@0.25.4

### Patch Changes

- [#154](https://github.com/greydragon888/real-router/pull/154) [`0d03ed2`](https://github.com/greydragon888/real-router/commit/0d03ed23cd6a28dbc0f66ffaf95d96328b5cf89e) Thanks [@greydragon888](https://github.com/greydragon888)! - Pre-compute `buildParamNamesSet` at route registration time (#142)

  Eliminate per-call `Set` and `Array` allocations in `buildPath()` loose mode by pre-computing URL param names during route registration.


### @real-router/core@0.25.3

### Patch Changes

- [#152](https://github.com/greydragon888/real-router/pull/152) [`5a4ef0d`](https://github.com/greydragon888/real-router/commit/5a4ef0dcd57176b635ecea7d20fc3791c31affb1) Thanks [@greydragon888](https://github.com/greydragon888)! - Cache getTransitionPath result by state reference (#145)

  Add single-entry reference cache to `getTransitionPath()` eliminating redundant computations when multiple `shouldUpdateNode` predicates are called with the same state pair during a single navigation.


### @real-router/core@0.25.2

### Patch Changes

- [#150](https://github.com/greydragon888/real-router/pull/150) [`f56c0a6`](https://github.com/greydragon888/real-router/commit/f56c0a6f112438c1363558ff60627e63d248a1a7) Thanks [@greydragon888](https://github.com/greydragon888)! - Compare segment params in-place without intermediate objects (#141)

  Replace `extractSegmentParams()` + object comparison with direct `segmentParamsEqual()` that compares parameters from state objects without creating intermediate `SegmentParams` objects.
  Eliminates 2×N object allocations per navigation where N = common ancestor depth.


### @real-router/core@0.25.1

### Patch Changes

- [#148](https://github.com/greydragon888/real-router/pull/148) [`a431100`](https://github.com/greydragon888/real-router/commit/a431100935bcd1eefa8991b58a0ca4f828d4c431) Thanks [@greydragon888](https://github.com/greydragon888)! - Eliminate duplicate `nameToIDs()` calls in transition cleanup phase (#138)

  Reuse `toDeactivate`/`toActivate` arrays from `getTransitionPath()` result instead of calling `nameToIDs()` again during guard cleanup.
  Removes redundant code and 2 array allocations per navigation.


### @real-router/core@0.25.0

### Minor Changes

- [#136](https://github.com/greydragon888/real-router/pull/136) [`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove middleware layer (#133)

  **Breaking Change:** Middleware has been removed as an architectural concept.
  - Removed `router.useMiddleware()`
  - Removed `maxMiddleware` from `Limits`

  **Migration:**

  Side effects → `plugin.onTransitionSuccess` + `router.getRouteConfig()`:

  ```typescript
  // Before
  router.useMiddleware((router) => (toState) => {
    const config = router.getRouteConfig(toState.name);
    if (config?.title) document.title = config.title;
  });

  // After
  router.usePlugin((router) => ({
    onTransitionSuccess: (toState) => {
      const config = router.getRouteConfig(toState.name);
      if (config?.title) document.title = config.title;
    },
  }));
  ```

  Redirects → `forwardTo` in route config:

  ```typescript
  // Before
  router.useMiddleware((router) => (toState) => {
    if (toState.name === "old") return router.makeState("new");
  });

  // After
  const routes = [{ name: "old", path: "/old", forwardTo: "new" }];
  ```

  Cancellation → `canActivate` / `canDeactivate` guards:

  ```typescript
  // Before
  router.useMiddleware(() => (toState) => {
    if (!isAuthenticated()) return false;
  });

  // After
  router.addActivateGuard("admin", () => () => isAuthenticated());
  ```

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/types@0.15.0

### @real-router/types@0.15.0

### Minor Changes

- [#136](https://github.com/greydragon888/real-router/pull/136) [`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove middleware types (#133)

  **Breaking Change:** Middleware types removed following middleware layer removal in `@real-router/core`.
  - Removed `MiddlewareFn`, `Middleware`, `MiddlewareFactory` types
  - `TransitionPhase` narrowed from `"deactivating" | "activating" | "middleware"` to `"deactivating" | "activating"`

### @real-router/browser-plugin@0.5.2

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0

### @real-router/helpers@0.1.28

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0

### @real-router/logger-plugin@0.2.28

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0

### @real-router/persistent-params-plugin@0.1.28

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0

### @real-router/react@0.4.7

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0
  - @real-router/helpers@0.1.28

### @real-router/rx@0.1.17

### Patch Changes

- Updated dependencies [[`08c39e9`](https://github.com/greydragon888/real-router/commit/08c39e9042b5bd4ae87696da9957bdde83dc94f2)]:
  - @real-router/core@0.25.0

## [2026-02-21]

### @real-router/core@0.24.0

### Minor Changes

- [#134](https://github.com/greydragon888/real-router/pull/134) [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Introduce `GuardFn` type, remove `ActivationFn` from guards (#130)

  **Breaking Change:** Guards now must return `boolean | Promise<boolean>` only.
  Returning `State`, `void`, or `undefined` from guards is no longer supported.

  **Migration:**
  - Guards returning `true`/`false` → no changes needed
  - Guards returning `undefined`/`void` → add explicit `return true`
  - Guards returning `State` → move logic to middleware

- [#134](https://github.com/greydragon888/real-router/pull/134) [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `isPromise` re-export (#130)

  `isPromise` type guard is no longer exported from `@real-router/core`.

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/types@0.14.0

### @real-router/types@0.14.0

### Minor Changes

- [#134](https://github.com/greydragon888/real-router/pull/134) [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `GuardFn` type for dedicated guard signatures (#130)

  New `GuardFn` type narrows guard return type to `boolean | Promise<boolean>`.
  `ActivationFn` remains available for middleware.

### @real-router/browser-plugin@0.5.1

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0

### @real-router/helpers@0.1.27

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0

### @real-router/logger-plugin@0.2.27

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0

### @real-router/persistent-params-plugin@0.1.27

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0

### @real-router/react@0.4.6

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0
  - @real-router/helpers@0.1.27

### @real-router/rx@0.1.16

### Patch Changes

- Updated dependencies [[`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc), [`089d863`](https://github.com/greydragon888/real-router/commit/089d863936e610335a2dad0d653a9be5e0f0b4bc)]:
  - @real-router/core@0.24.0


### @real-router/core@0.23.1

### Patch Changes

- [#131](https://github.com/greydragon888/real-router/pull/131) [`50d2dc7`](https://github.com/greydragon888/real-router/commit/50d2dc7a6e885aa83af0a96489bfbf6ca735d806) Thanks [@greydragon888](https://github.com/greydragon888)! - Align PluginsNamespace and MiddlewareNamespace patterns (#129)

  Internal consistency refactoring across the two extension namespaces:
  - **`validateNoDuplicates`**: Middleware now uses callback pattern (`has`) instead of allocating a `Set` from array on every call
  - **Error messages**: Plugins now include index in args validation and counts in limit errors, using `getTypeDescription()` instead of raw `typeof`
  - **Threshold warnings**: Plugin warnings now include actionable context (hard limit value, guidance), matching middleware style
  - **Logger context**: Middleware logger context extracted to a `LOGGER_CONTEXT` constant in `constants.ts`
  - **`disposeAll` / `clearAll`**: Added JSDoc documenting the semantic distinction between the two operations

## [2026-02-20]

### @real-router/core@0.23.0

### Minor Changes

- [#127](https://github.com/greydragon888/real-router/pull/127) [`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `source` parameter from `matchPath()` (#121)

  **Breaking change:** `matchPath()` no longer accepts a second `source` argument.

  **Migration:**

  ```diff
  - router.matchPath('/users/123', 'popstate')
  + router.matchPath('/users/123')
  ```

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/types@0.13.0

### @real-router/types@0.13.0

### Minor Changes

- [#127](https://github.com/greydragon888/real-router/pull/127) [`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove redundant `StateMeta.redirected` and `StateMeta.source` fields (#121)

  **Breaking change:** `StateMeta` no longer includes `redirected` or `source` fields.

  **Migration:**

  ```diff
  - if (state.meta.redirected) { ... }
  + if (state.meta.options.redirected) { ... }
  ```

  The `source` field was dead code — no consumer ever read it, so no migration is needed.

### @real-router/browser-plugin@0.5.0

### Minor Changes

- [#127](https://github.com/greydragon888/real-router/pull/127) [`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `StateMeta.redirected` and `StateMeta.source` writes (#121)

  Internal state construction no longer sets the removed `redirected` and `source` fields on `state.meta`. No public API change — `NavigationOptions.source` and `NavigationOptions.redirected` are unaffected.

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0

### @real-router/helpers@0.1.26

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0

### @real-router/logger-plugin@0.2.26

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0

### @real-router/persistent-params-plugin@0.1.26

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0

### @real-router/react@0.4.5

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0
  - @real-router/helpers@0.1.26

### @real-router/react@0.4.4

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/browser-plugin@0.4.0
  - @real-router/core@0.22.0
  - @real-router/helpers@0.1.25

### @real-router/rx@0.1.15

### Patch Changes

- Updated dependencies [[`9a500cc`](https://github.com/greydragon888/real-router/commit/9a500cc1d4f8f707c9cd0e6cd0836949ad77a7fb)]:
  - @real-router/core@0.23.0


### @real-router/browser-plugin@0.4.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - **Breaking:** Update `navigateToState()` signature (#123)

  Remove `emitSuccess` parameter from the `navigateToState()` override to match the updated core API. Event emission is now driven by FSM transitions.

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/core@0.22.0

### @real-router/core@0.22.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - **Breaking:** Remove `router.cancel()` method (#123)

  The `cancel()` method has been removed. Its functionality is now handled internally:
  - `stop()` and `dispose()` automatically cancel in-flight transitions
  - Concurrent `navigate()` calls cancel the previous navigation

  **Migration:**

  ```diff
  - router.cancel();
  + router.stop(); // or just call router.navigate() which cancels previous
  ```

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `router.dispose()` for permanent router termination (#123)

  New method that permanently terminates the router. Unlike `stop()`, a disposed router cannot be restarted. All mutating methods throw `RouterError(ROUTER_DISPOSED)` after disposal. Read-only methods (`getState`, `isActive`, `getOptions`, `buildPath`) remain functional. Idempotent — safe to call multiple times.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - **Breaking:** Remove `emitSuccess` parameter from `navigateToState()` (#123)

  The `emitSuccess` parameter has been removed from `navigateToState()`. Event emission is now driven by FSM transitions and is no longer optional.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `state.transition` (TransitionMeta) after every navigation (#123)

  After every successful navigation, `router.getState()` includes a deeply frozen `transition` field with: `phase` (last pipeline phase reached), `from` (previous route name), `reason` (`"success"` for resolved navigations), and `segments` (`deactivated`, `activated`, `intersection`).

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add configurable `warnListeners` limit (#123)

  New `limits.warnListeners` option (default: 1000, 0 to disable) warns about potential memory leaks when event listener count exceeds the threshold. Previously the warning threshold was hardcoded.

### Patch Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize EventEmitter emit() hot path (#123)

  Three optimizations to the internal event-emitter `emit()`:
  1. Replace `Function.prototype.apply.call` with switch by args.length (direct calls for 0-3 args)
  2. Separate fast path when `maxEventDepth === 0` — skips depth tracking, try/finally, and depthMap operations
  3. Inline `#checkRecursionDepth` + `#getDepthMap` into depth-tracking path, eliminating 2 method calls

  Benchmark results vs baseline: emit() 3 args 1 listener **-36%** (30→19 ns), full navigation cycle **-8%** (175→161 ns), 1000 emits **-38%** (30.5→19.1 μs).

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal: FSM-driven lifecycle, EventBusNamespace, wiring extraction (#123)

  All router state (`#started`, `#active`, `#navigating` booleans) replaced by a single RouterFSM — lifecycle events are consequences of FSM transitions via typed actions. `ObservableNamespace` removed; generic event-emitter logic extracted into private `event-emitter` package; FSM + EventEmitter + `#currentToState` encapsulated in `EventBusNamespace`. `#setupDependencies()` extracted into `RouterWiringBuilder` (Builder+Director pattern). Guard registration logic moved from Router facade into `RouteLifecycleNamespace`. Router.ts reduced from 1585 to 1176 lines.

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize hot paths: cached error callback, Set replaced with includes (#123)

  Cache `.catch()` callback as `static #onSuppressedError` (one allocation per class, not per `navigate()` call). Replace `new Set(activeSegments)` with `Array.includes()` for segment cleanup (1-5 elements — linear search is faster than Set construction).

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix bare logger imports causing double bundle inline (#123)

  Replace `import { logger } from "logger"` with `from "@real-router/logger"` in `executeMiddleware.ts` and `executeLifecycleHooks.ts` to prevent the logger module from being inlined twice in the bundle.

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/fsm@0.2.0
  - @real-router/types@0.12.0

### @real-router/fsm@0.1.0

### Minor Changes

- [#111](https://github.com/greydragon888/real-router/pull/111) [`fd84735`](https://github.com/greydragon888/real-router/commit/fd847353f413a4c6727751cfdc6e078abef7c14d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/fsm` package — universal synchronous FSM engine (#110)

  New package providing a zero-dependency, fully typed finite state machine with O(1) transition lookup, type-safe payloads via `TPayloadMap`, and listener management with null-slot reuse pattern.

### @real-router/types@0.12.0

### Minor Changes

- [#123](https://github.com/greydragon888/real-router/pull/123) [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19) Thanks [@greydragon888](https://github.com/greydragon888)! - Add TransitionMeta types and ROUTER_DISPOSED error code (#123)

  New types: `TransitionMeta`, `TransitionPhase`, `TransitionReason`. New error code: `ROUTER_DISPOSED` for disposed router operations.

### @real-router/helpers@0.1.25

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/core@0.22.0

### @real-router/logger-plugin@0.2.25

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/core@0.22.0

### @real-router/persistent-params-plugin@0.1.25

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/core@0.22.0

### @real-router/rx@0.1.14

### Patch Changes

- Updated dependencies [[`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19), [`be94ab2`](https://github.com/greydragon888/real-router/commit/be94ab231647999db580b41c5be5e032bc622b19)]:
  - @real-router/core@0.22.0

## [2026-02-16]

### @real-router/fsm@0.2.0

### Minor Changes

- [#111](https://github.com/greydragon888/real-router/pull/111) [`fd84735`](https://github.com/greydragon888/real-router/commit/fd847353f413a4c6727751cfdc6e078abef7c14d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/fsm` package — universal synchronous FSM engine (#110)

  New package providing a zero-dependency, fully typed finite state machine with O(1) transition lookup, type-safe payloads via `TPayloadMap`, and listener management with null-slot reuse pattern.

## [2026-02-15]

### @real-router/core@0.21.0

### Minor Changes

- [#102](https://github.com/greydragon888/real-router/pull/102) [`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING CHANGE**: Remove dot-notation support from route names (#93)

  Dots are now banned in the route `name` field. Use children syntax or the new `{ parent }` option in `addRoute()` instead.

  **Before:**

  ```typescript
  const routes = [
    { name: "users", path: "/users" },
    { name: "users.profile", path: "/:id" }, // ❌ No longer allowed
  ];
  ```

  **After (children syntax):**

  ```typescript
  const routes = [
    {
      name: "users",
      path: "/users",
      children: [{ name: "profile", path: "/:id" }],
    },
  ];
  ```

  **After ({ parent } option):**

  ```typescript
  router.addRoute({ name: "users", path: "/users" });
  router.addRoute({ name: "profile", path: "/:id" }, { parent: "users" });
  ```

  **Note:** Dots in fullName references (e.g., `navigate("users.profile")`) remain valid and unchanged.

  **Changes:**
  - Ban dots in route `name` field (throws TypeError with clear message)
  - Add `addRoute(route, { parent: "users" })` option for lazy loading
  - Remove ~170 lines of complex recursive dot-notation parsing code
  - Simplify route tree building from two-pass to single-pass algorithm

### @real-router/browser-plugin@0.3.3

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0

### @real-router/helpers@0.1.24

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0

### @real-router/logger-plugin@0.2.24

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0

### @real-router/persistent-params-plugin@0.1.24

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0

### @real-router/react@0.4.3

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0
  - @real-router/browser-plugin@0.3.3
  - @real-router/helpers@0.1.24

### @real-router/rx@0.1.13

### Patch Changes

- Updated dependencies [[`8b445e4`](https://github.com/greydragon888/real-router/commit/8b445e4b3695122e3597a450e5f23744a3381a3f)]:
  - @real-router/core@0.21.0


### @real-router/core@0.20.0

### Minor Changes

- [#100](https://github.com/greydragon888/real-router/pull/100) [`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57) Thanks [@greydragon888](https://github.com/greydragon888)! - feat!: remove `clearMiddleware()` method (#91)

  BREAKING CHANGE: `clearMiddleware()` has been removed. Use the `Unsubscribe` function returned by `useMiddleware()` instead.

  Before:

  ```ts
  router.useMiddleware(myMiddleware);
  // later...
  router.clearMiddleware();
  ```

  After:

  ```ts
  const unsub = router.useMiddleware(myMiddleware);
  // later...
  unsub();
  ```

### @real-router/browser-plugin@0.3.2

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0

### @real-router/helpers@0.1.23

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0

### @real-router/logger-plugin@0.2.23

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0

### @real-router/persistent-params-plugin@0.1.23

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0

### @real-router/react@0.4.2

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0
  - @real-router/browser-plugin@0.3.2
  - @real-router/helpers@0.1.23

### @real-router/rx@0.1.12

### Patch Changes

- Updated dependencies [[`c538d0d`](https://github.com/greydragon888/real-router/commit/c538d0d93be09bc438f8dde989b4770963b29e57)]:
  - @real-router/core@0.20.0


### @real-router/core@0.19.0

### Minor Changes

- [#98](https://github.com/greydragon888/real-router/pull/98) [`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `getOption()` method (#92)

  **Breaking Change:** `getOption()` has been removed. Use `getOptions()` instead — options are immutable after `createRouter()`, so property access is equivalent.

  **Migration:**

  ```diff
  - router.getOption("defaultRoute")
  + router.getOptions().defaultRoute
  ```

### @real-router/browser-plugin@0.3.1

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0

### @real-router/helpers@0.1.22

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0

### @real-router/logger-plugin@0.2.22

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0

### @real-router/persistent-params-plugin@0.1.22

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0

### @real-router/react@0.4.1

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0
  - @real-router/browser-plugin@0.3.1
  - @real-router/helpers@0.1.22

### @real-router/rx@0.1.11

### Patch Changes

- Updated dependencies [[`9b46db5`](https://github.com/greydragon888/real-router/commit/9b46db5158648460891cd0db2933fe7f1f2049d0)]:
  - @real-router/core@0.19.0


### @real-router/browser-plugin@0.3.0

### Minor Changes

- [#96](https://github.com/greydragon888/real-router/pull/96) [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7) Thanks [@greydragon888](https://github.com/greydragon888)! - Simplify `start()` override for required path in core (#90)
  - Add `start(path?: string)` overload via module augmentation, so TypeScript allows `router.start()` without arguments when browser-plugin is installed.
  - Remove `StartRouterArguments` type export (**breaking**).
  - The `start()` override now always provides browser location to core when no path is given.

  **Behavioral change:** When browser is at `/` and `router.start()` is called without arguments, the plugin now passes `"/"` to core (previously fell through to `defaultRoute` resolution). If your `defaultRoute` points to a route with a path other than `/`, you may need to add a route for `/` or call `router.start()` then `router.navigateToDefault()` explicitly.

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0

### @real-router/core@0.18.0

### Minor Changes

- [#96](https://github.com/greydragon888/real-router/pull/96) [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7) Thanks [@greydragon888](https://github.com/greydragon888)! - Make `path` a required argument in `router.start()` (#90)

  **Breaking Change:** `router.start()` now requires a path string argument.

  **Migration:**

  ```diff
  - await router.start();
  + await router.start("/home");
  ```

  Browser-plugin users are unaffected — the plugin injects browser location automatically.

### Patch Changes

- [#96](https://github.com/greydragon888/real-router/pull/96) [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix plugin interception not working during `router.start()` (#90)

  `RoutesNamespace.matchPath()` called `this.forwardState()` at the namespace level, bypassing facade plugin wrappers. Injected facade's `forwardState` into `RoutesDependencies` so plugins (e.g. `persistent-params-plugin`) can intercept during startup.

### @real-router/react@0.4.0

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

### @real-router/react@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0

### @real-router/helpers@0.1.21

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0

### @real-router/logger-plugin@0.2.21

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0

### @real-router/persistent-params-plugin@0.1.21

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0

### @real-router/react@0.4.0

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0
  - @real-router/browser-plugin@0.3.0
  - @real-router/helpers@0.1.21

### @real-router/rx@0.1.10

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0

## [2026-02-14]

### @real-router/browser-plugin@0.2.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(browser-plugin)!: adapt to Promise-based navigation API (#45)

  **Breaking Change:** `router.start()` with browser plugin now returns `Promise<State>`.

  ```typescript
  // Before
  router.start("/users", (err, state) => {
    if (err) console.error(err);
  });

  // After
  const state = await router.start("/users");
  ```

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/core@0.17.0

### @real-router/core@0.17.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(core)!: Promise-based navigation API (#45)

  **Breaking Change:** `navigate()`, `navigateToDefault()`, `start()` now return `Promise<State>` instead of `CancelFn`/`this`.

  ```typescript
  // Before (callback-based)
  router.navigate("users", { id: "123" }, {}, (err, state) => {
    if (err) console.error(err);
    else console.log(state);
  });

  // After (Promise-based)
  const state = await router.navigate("users", { id: "123" });
  ```

  - `start()` no longer accepts `State` parameter (only `string` path)
  - `parseNavigateArgs()`, `safeCallback()` removed
  - Guards no longer receive `done` callback — return values directly

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/types@0.11.0

### @real-router/types@0.11.0

### Minor Changes

- [#94](https://github.com/greydragon888/real-router/pull/94) [`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5) Thanks [@greydragon888](https://github.com/greydragon888)! - feat(types)!: remove callback types, simplify navigation signatures (#45)

  **Breaking Change:**
  - `DoneFn` type removed
  - `CancelFn` type removed
  - `ActivationFn` simplified — `done` callback parameter removed
  - `Navigator.navigate()` returns `Promise<State>` (was `CancelFn`)

  ```typescript
  // Before
  type ActivationFn = (toState, fromState, done: DoneFn) => ...;

  // After
  type ActivationFn = (toState, fromState) => boolean | Promise<boolean | State | void> | State | void;
  ```

### @real-router/helpers@0.1.20

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/core@0.17.0

### @real-router/logger-plugin@0.2.20

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/core@0.17.0

### @real-router/persistent-params-plugin@0.1.20

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/core@0.17.0

### @real-router/rx@0.1.9

### Patch Changes

- Updated dependencies [[`401397a`](https://github.com/greydragon888/real-router/commit/401397ad958c933e865d52791a6a7628ef7705a5)]:
  - @real-router/core@0.17.0

## [2026-02-11]

### @real-router/core@0.16.0

### Minor Changes

- [#88](https://github.com/greydragon888/real-router/pull/88) [`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `canDeactivate` support to `Route` and `RouteConfigUpdate` interfaces (#84)

  Added `canDeactivate` support to `Route` and `RouteConfigUpdate` interfaces, closing the API asymmetry with `canActivate`. Routes can now declare deactivation guards declaratively at `addRoute()` and dynamically via `updateRoute()`.

### @real-router/browser-plugin@0.1.19

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0

### @real-router/helpers@0.1.19

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0

### @real-router/logger-plugin@0.2.19

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0

### @real-router/persistent-params-plugin@0.1.19

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0

### @real-router/react@0.3.1

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0
  - @real-router/browser-plugin@0.1.19
  - @real-router/helpers@0.1.19

### @real-router/rx@0.1.8

### Patch Changes

- Updated dependencies [[`178dba2`](https://github.com/greydragon888/real-router/commit/178dba2714ecf657dd384b96aa5c8558df8e0dde)]:
  - @real-router/core@0.16.0


### @real-router/core@0.15.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Extract `getNavigator` into standalone function (#83)

  Extract `getNavigator` into standalone function. BREAKING: `Router.getNavigator()` method removed. Use `import { getNavigator } from '@real-router/core'` and call `getNavigator(router)` instead.

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/types@0.10.0

### @real-router/react@0.3.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Update to use standalone `getNavigator` function (#83)

  Update to use standalone `getNavigator` function. Fix `useRouteNode` navigator memoization bug.

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0
  - @real-router/browser-plugin@0.1.18
  - @real-router/helpers@0.1.18

### @real-router/types@0.10.0

### Minor Changes

- [#85](https://github.com/greydragon888/real-router/pull/85) [`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `getNavigator` from Router interface (#83)

  Remove `getNavigator` from Router interface.

### @real-router/browser-plugin@0.1.18

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0

### @real-router/helpers@0.1.18

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0

### @real-router/logger-plugin@0.2.18

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0

### @real-router/persistent-params-plugin@0.1.18

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0

### @real-router/rx@0.1.7

### Patch Changes

- Updated dependencies [[`fa5e6b7`](https://github.com/greydragon888/real-router/commit/fa5e6b7e46bf6c9c6ce9b78503808df807de5c59)]:
  - @real-router/core@0.15.0


### @real-router/core@0.14.0

### Minor Changes

- [#80](https://github.com/greydragon888/real-router/pull/80) [`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d) Thanks [@greydragon888](https://github.com/greydragon888)! - Rename guard API and add route accessibility checks (#42)

  ## New Methods
  - **`addActivateGuard(name, guard)`** — Registers activation guard for a route.
  - **`addDeactivateGuard(name, guard)`** — Registers deactivation guard for a route.
  - **`removeActivateGuard(name)`** — Removes previously registered activation guard.
  - **`removeDeactivateGuard(name)`** — Removes previously registered deactivation guard.
  - **`canNavigateTo(name, params?)`** — Synchronously checks if navigation to a route would be allowed by guards. Returns `boolean`.

  ## Removed (Breaking)
  - **`canActivate(name, guard)`** — Removed. Use `addActivateGuard()` instead.
  - **`canDeactivate(name, guard)`** — Removed. Use `addDeactivateGuard()` instead.

  ## Enhanced
  - **`getNavigator()`** — Navigator now includes `canNavigateTo` as 5th method.

  ## Migration

  ```diff
  - router.canActivate('admin', guard)
  + router.addActivateGuard('admin', guard)

  - router.canDeactivate('editor', guard)
  + router.addDeactivateGuard('editor', guard)
  ```

  **Note:** Route config field `canActivate` in route definitions does NOT change.

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/types@0.9.0

### @real-router/types@0.9.0

### Minor Changes

- [#80](https://github.com/greydragon888/real-router/pull/80) [`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d) Thanks [@greydragon888](https://github.com/greydragon888)! - Add guard API and Navigator type signatures (#42)
  - Add `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard` to Router interface.
  - Add `canNavigateTo` to Router and Navigator interfaces.
  - Remove deprecated `canActivate` and `canDeactivate` from Router interface.

### @real-router/browser-plugin@0.1.17

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

### @real-router/helpers@0.1.17

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

### @real-router/logger-plugin@0.2.17

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

### @real-router/persistent-params-plugin@0.1.17

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

### @real-router/react@0.2.8

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0
  - @real-router/browser-plugin@0.1.17
  - @real-router/helpers@0.1.17

### @real-router/rx@0.1.6

### Patch Changes

- Updated dependencies [[`f8eabef`](https://github.com/greydragon888/real-router/commit/f8eabef39ba72d1d5e3bab0b05ffb9c0241dc36d)]:
  - @real-router/core@0.14.0

## [2026-02-10]

### @real-router/core@0.13.0

### Minor Changes

- [#78](https://github.com/greydragon888/real-router/pull/78) [`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `buildNavigationState()` and remove `skipTransition` option (#44)

  **Breaking Change:** The `skipTransition` option has been removed from `NavigationOptions`.

  **New API:**

  ```typescript
  // Pure function — returns State without navigating
  const state = router.buildNavigationState("users.view", { id: 123 });
  if (state) {
    console.log(state.path); // '/users/view/123'
  }
  // Returns undefined if route not found
  ```

  **Migration from `skipTransition`:**

  ```typescript
  // Before
  router.navigate('route', params, { skipTransition: true }, (err, state) => { ... });

  // After
  const state = router.buildNavigationState('route', params);
  ```

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/types@0.8.0

### @real-router/types@0.8.0

### Minor Changes

- [#78](https://github.com/greydragon888/real-router/pull/78) [`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `skipTransition` from `NavigationOptions` type (#44)

  **Breaking Change:** The `skipTransition` field has been removed from the `NavigationOptions` interface.

### @real-router/browser-plugin@0.1.16

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0

### @real-router/helpers@0.1.16

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0

### @real-router/logger-plugin@0.2.16

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0

### @real-router/persistent-params-plugin@0.1.16

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0

### @real-router/react@0.2.7

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0
  - @real-router/browser-plugin@0.1.16
  - @real-router/helpers@0.1.16

### @real-router/rx@0.1.5

### Patch Changes

- Updated dependencies [[`f57f780`](https://github.com/greydragon888/real-router/commit/f57f78019afde605d693acdfea287eac4aee224a)]:
  - @real-router/core@0.13.0


### @real-router/core@0.12.0

### Minor Changes

- [#75](https://github.com/greydragon888/real-router/pull/75) [`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95) Thanks [@greydragon888](https://github.com/greydragon888)! - Add dynamic `forwardTo` callback support (#43)

  `forwardTo` now accepts `string | ForwardToCallback<Dependencies>` — a sync callback receiving `(getDependency, params)` that returns a target route name at navigation time. Enables role-based routing, feature flags, A/B testing, and tenant-specific routing.
  - Separate storage: `forwardMap` (static, O(1) cached) + `forwardFnMap` (dynamic, resolved per-navigation)
  - Mixed chain support: static-to-dynamic, dynamic-to-static, dynamic-to-dynamic
  - Runtime validation: return type, target existence, cycle detection (visited Set, max depth 100)
  - Sync-only enforcement: async callbacks rejected at registration (even with `noValidate: true`)
  - Full support in `addRoute`, `updateRoute`, `removeRoute`, `clearRoutes`, `clone`, `matchPath`, `buildState`

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/types@0.7.0

### @real-router/types@0.7.0

### Minor Changes

- [#75](https://github.com/greydragon888/real-router/pull/75) [`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `ForwardToCallback` type for dynamic route forwarding (#43)

  New generic type `ForwardToCallback<Dependencies>` — a sync callback `(getDependency, params) => string` that enables runtime-conditional route forwarding.

### @real-router/browser-plugin@0.1.15

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0

### @real-router/helpers@0.1.15

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0

### @real-router/logger-plugin@0.2.15

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0

### @real-router/persistent-params-plugin@0.1.15

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0

### @real-router/react@0.2.6

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0
  - @real-router/browser-plugin@0.1.15
  - @real-router/helpers@0.1.15

### @real-router/rx@0.1.4

### Patch Changes

- Updated dependencies [[`c1ef6aa`](https://github.com/greydragon888/real-router/commit/c1ef6aac004b67b51b534f071992583393379d95)]:
  - @real-router/core@0.12.0


### @real-router/core@0.11.0

### Minor Changes

- [#72](https://github.com/greydragon888/real-router/pull/72) [`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5) Thanks [@greydragon888](https://github.com/greydragon888)! - Support dynamic `defaultRoute` and `defaultParams` via callback functions (#39)

  `defaultRoute` and `defaultParams` options now accept callback functions that receive `getDependency` for dynamic value computation based on router dependencies. Callbacks are resolved at point of use (`start()`, `navigateToDefault()`), never cached.

  **Breaking Type Change**: `router.getOptions().defaultRoute` now returns `string | DefaultRouteCallback` (was `string`). Similarly, `router.getOptions().defaultParams` now returns `Params | DefaultParamsCallback` (was `Params`). Code that assigns these values to typed variables may need type assertions or `typeof` checks.

  **Behavior Note**: A callback returning empty string `""` in `navigateToDefault()` returns noop (no navigation). In `start()` without path, it produces `ROUTE_NOT_FOUND` error (not `NO_START_PATH_OR_STATE`).

  ```typescript
  const router = createRouter(routes, {
    defaultRoute: (getDep) =>
      getDep("userRole") === "admin" ? "admin.dashboard" : "home",
    defaultParams: (getDep) => ({ userId: getDep("currentUserId") }),
  });
  ```

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/types@0.6.0

### @real-router/types@0.6.0

### Minor Changes

- [#72](https://github.com/greydragon888/real-router/pull/72) [`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `DefaultRouteCallback` and `DefaultParamsCallback` types (#39)

  New callback type aliases for dynamic `defaultRoute` and `defaultParams` options. `Options.defaultRoute` is now `string | DefaultRouteCallback`, `Options.defaultParams` is now `Params | DefaultParamsCallback`.

### @real-router/browser-plugin@0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/helpers@0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/logger-plugin@0.2.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/persistent-params-plugin@0.1.14

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

### @real-router/react@0.2.5

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0
  - @real-router/browser-plugin@0.1.14
  - @real-router/helpers@0.1.14

### @real-router/rx@0.1.3

### Patch Changes

- Updated dependencies [[`bf33e8e`](https://github.com/greydragon888/real-router/commit/bf33e8ed110628c4657a9f2521d1f323b96f42a5)]:
  - @real-router/core@0.11.0

## [2026-02-09]

### @real-router/core@0.10.0

### Minor Changes

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `setOption()`, make options immutable (#63)

  **Breaking Change:** Router options are now immutable after construction. The `setOption()` method has been removed along with the `lock()`/`unlock()` lifecycle.

  Options that were previously changeable after `start()` (`defaultRoute`, `defaultParams`) must now be set in the constructor:

  ```diff
  - const router = createRouter(routes);
  - router.setOption('defaultRoute', 'home');
  - router.start();
  + const router = createRouter(routes, { defaultRoute: 'home' });
  + router.start();
  ```

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace rou3 with custom Segment Trie path matcher (#63)

  The internal path matching engine has been replaced from rou3's radix tree to a custom Segment Trie matcher. Each trie edge represents an entire URL segment (not per-character prefix), enabling hierarchical named routing with static cache, pre-computed `buildPath` templates, and zero-allocation match.

  The public API (`matchPath`, `buildPath`, `buildState`) is unchanged.

### Patch Changes

- [#69](https://github.com/greydragon888/real-router/pull/69) [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize `matchPath` by inlining `buildPath` and skipping `defaultParams` re-merge (#63)

### @real-router/browser-plugin@0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/helpers@0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/logger-plugin@0.2.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/persistent-params-plugin@0.1.13

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

### @real-router/react@0.2.4

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0
  - @real-router/browser-plugin@0.1.13
  - @real-router/helpers@0.1.13

### @real-router/rx@0.1.2

### Patch Changes

- Updated dependencies [[`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823), [`1aa5975`](https://github.com/greydragon888/real-router/commit/1aa597590d175ddc70f00424f9484fa4f025f823)]:
  - @real-router/core@0.10.0

## [2026-02-08]

### @real-router/core@0.9.0

### Minor Changes

- [#61](https://github.com/greydragon888/real-router/pull/61) [`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998) Thanks [@greydragon888](https://github.com/greydragon888)! - Migrate routing engine to rou3 and optimize path building (#40)

  **BREAKING CHANGES:**
  - Encoding mode `legacy` has been removed. Use `uri` instead (1:1 equivalent).
  - `children.values()` iteration order now follows definition order instead of routing priority order. This affects `routeTreeToDefinitions()` output order. Matching behavior is unchanged (handled by rou3 radix tree).

  **Performance improvements:**
  - Migrated to rou3 radix tree for 1000x+ faster route matching
  - Optimized path building with standalone services (inject, validateConstraints, encodeParam)
  - Replaced parser metadata access with lightweight paramMeta structure
  - Removed dead sorting code (~50 lines) — no longer needed with rou3

  **Migration:**

  ```typescript
  // Before:
  buildPath(tree, "route", params, { urlParamsEncoding: "legacy" });

  // After:
  buildPath(tree, "route", params, { urlParamsEncoding: "uri" });
  ```

### @real-router/types@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### @real-router/browser-plugin@0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/helpers@0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/logger-plugin@0.2.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/persistent-params-plugin@0.1.12

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

### @real-router/react@0.2.3

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0
  - @real-router/browser-plugin@0.1.12
  - @real-router/helpers@0.1.12

### @real-router/rx@0.1.1

### Patch Changes

- Updated dependencies [[`7361cb0`](https://github.com/greydragon888/real-router/commit/7361cb03b5f00b078eb1e54fa43d29f1ea381998)]:
  - @real-router/core@0.9.0

## [2026-02-06]

### @real-router/core@0.8.0

### Minor Changes

- [#59](https://github.com/greydragon888/real-router/pull/59) [`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `router[Symbol.observable]()` from core — Observable API moved to `@real-router/rx` (#41)

  **Breaking Change:** `router[Symbol.observable]()` and `router["@@observable"]()` are removed from core.

  **Migration:**

  ```typescript
  // Before
  router[Symbol.observable]().subscribe(observer);

  // After
  import { observable } from "@real-router/rx";
  observable(router).subscribe(observer);

  // Or with state stream
  import { state$ } from "@real-router/rx";
  state$(router).subscribe((state) => console.log(state));
  ```

  **Why:** Achieves zero bundle cost for users who don't need reactive streams (~2KB savings).

### @real-router/rx@0.1.0

### Minor Changes

- [#59](https://github.com/greydragon888/real-router/pull/59) [`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e) Thanks [@greydragon888](https://github.com/greydragon888)! - Initial release of @real-router/rx (#41)

  New package providing zero-cost opt-in Observable functionality for Real-Router:
  - `state$(router)` — reactive state stream with replay semantics
  - `events$(router)` — typed event stream for all router events
  - `observable(router)` — TC39 Observable wrapper for RxJS interop
  - Operators: `map`, `filter`, `debounceTime`, `distinctUntilChanged`, `takeUntil`
  - Full TC39 Observable compliance with `Symbol.observable`

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/browser-plugin@0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/helpers@0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/logger-plugin@0.2.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/persistent-params-plugin@0.1.11

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0

### @real-router/react@0.2.2

### Patch Changes

- Updated dependencies [[`72bd00a`](https://github.com/greydragon888/real-router/commit/72bd00a9a7057daab0cd0ccfea1166f37668f48e)]:
  - @real-router/core@0.8.0
  - @real-router/browser-plugin@0.1.11
  - @real-router/helpers@0.1.11

## [2026-02-05]

### @real-router/core@0.7.0

### Minor Changes

- [#57](https://github.com/greydragon888/real-router/pull/57) [`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add configurable limits via `options.limits` (#38)

  All router limits are now centralized into a single configuration object. Previously, limits were hardcoded in individual namespaces.

  ```typescript
  const router = createRouter(routes, {
    limits: {
      maxDependencies: 150,
      maxPlugins: 75,
    },
  });

  // Read-only access
  console.log(router.limits);
  // { maxDependencies: 150, maxPlugins: 75, maxMiddleware: 50, ... }
  ```

  **Available limits:**

  | Limit                  | Default | Description                                |
  | ---------------------- | ------- | ------------------------------------------ |
  | `maxDependencies`      | 100     | Maximum registered dependencies            |
  | `maxPlugins`           | 50      | Maximum registered plugins                 |
  | `maxMiddleware`        | 50      | Maximum middleware functions               |
  | `maxListeners`         | 10000   | Maximum event listeners per event type     |
  | `maxEventDepth`        | 5       | Maximum nested event propagation depth     |
  | `maxLifecycleHandlers` | 200     | Maximum canActivate/canDeactivate handlers |

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/types@0.5.0

### @real-router/types@0.5.0

### Minor Changes

- [#57](https://github.com/greydragon888/real-router/pull/57) [`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `LimitsConfig` interface and `limits` option (#38)

  New `LimitsConfig` interface defines 6 configurable router limits:
  - `maxDependencies`, `maxPlugins`, `maxMiddleware`
  - `maxListeners`, `maxEventDepth`, `maxLifecycleHandlers`

  The `Options` interface now includes `limits?: Partial<LimitsConfig>`.

### @real-router/browser-plugin@0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/helpers@0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/logger-plugin@0.2.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/persistent-params-plugin@0.1.10

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0

### @real-router/react@0.2.1

### Patch Changes

- Updated dependencies [[`8856681`](https://github.com/greydragon888/real-router/commit/8856681e7a2300acf7aa4db2ff77f50567eddb2c)]:
  - @real-router/core@0.7.0
  - @real-router/browser-plugin@0.1.10
  - @real-router/helpers@0.1.10

## [2026-02-04]

### @real-router/react@0.2.0

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

### @real-router/core@0.6.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `getNavigator()` method (#37)

  New `Router.getNavigator()` method returns a frozen, cached `Navigator` instance with safe subset of router methods for UI components.

  ```typescript
  const navigator = router.getNavigator();
  navigator.navigate("home");
  navigator.getState();
  navigator.isActiveRoute("home");
  navigator.subscribe(listener);
  ```

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/types@0.4.0

### @real-router/types@0.4.0

### Minor Changes

- [#55](https://github.com/greydragon888/real-router/pull/55) [`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `Navigator` interface for safe router subset (#37)

  New `Navigator` interface providing minimal router API for UI components:
  - `navigate()` — navigate to route
  - `getState()` — get current state
  - `isActiveRoute()` — check if route is active
  - `subscribe()` — subscribe to route changes

### @real-router/browser-plugin@0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/helpers@0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/logger-plugin@0.2.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/persistent-params-plugin@0.1.9

### Patch Changes

- Updated dependencies [[`f5a0cab`](https://github.com/greydragon888/real-router/commit/f5a0cabdc3d749d45e741d155bea3fc67df46e08)]:
  - @real-router/core@0.6.0

### @real-router/core@0.5.0

### Minor Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `noValidate` option to disable validation in production (#53)

  New configuration option for performance-critical environments:

  ```typescript
  const router = createRouter(routes, {
    noValidate: process.env.NODE_ENV === "production",
  });
  ```

  When enabled, skips argument validation in ~40 public methods.
  Constructor always validates options object itself.

### Patch Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Make middleware unsubscribe function idempotent (#53)

  Calling unsubscribe multiple times no longer throws an error.

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Optimize `usePlugin()` for single-plugin calls (#53)

  Skip array/Set allocation when registering a single plugin.

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/types@0.3.0

### @real-router/types@0.3.0

### Minor Changes

- [#53](https://github.com/greydragon888/real-router/pull/53) [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `noValidate` option to disable validation in production (#53)

  New configuration option for performance-critical environments:

  ```typescript
  const router = createRouter(routes, {
    noValidate: process.env.NODE_ENV === "production",
  });
  ```

  When enabled, skips argument validation in ~40 public methods.
  Constructor always validates options object itself.

### @real-router/browser-plugin@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/helpers@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/logger-plugin@0.2.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/persistent-params-plugin@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0

### @real-router/react@0.1.8

### Patch Changes

- Updated dependencies [[`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb), [`101656f`](https://github.com/greydragon888/real-router/commit/101656fadc5f73d246b3772fc457ff4a570687fb)]:
  - @real-router/core@0.5.0
  - @real-router/browser-plugin@0.1.8
  - @real-router/helpers@0.1.8

## [2026-01-30]

### @real-router/core@0.4.0

### Minor Changes

- [#46](https://github.com/greydragon888/real-router/pull/46) [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572) Thanks [@greydragon888](https://github.com/greydragon888)! - ## Public API Audit — Remove Legacy Internal Methods

  ### Breaking Changes

  **Removed methods:**
  - `isStarted()` — use `isActive()` instead
  - `isNavigating()` — track via middleware/events if needed
  - `forward()` — use `forwardTo` option in route config
  - `setState()` — internal only, use `navigate()` or `navigateToState()`
  - `areStatesDescendants()` — use `state2.name.startsWith(state1.name + ".")`
  - `clearCanActivate()` — override with `canActivate(name, true)`
  - `clearCanDeactivate()` — override with `canDeactivate(name, true)`
  - `removeEventListener()` — use unsubscribe function from `addEventListener()`
  - `makeNotFoundState()` — use `navigateToDefault()` or handle in middleware
  - `getPlugins()` — track plugins in application code if needed
  - `invokeEventListeners()` — internal only
  - `hasListeners()` — internal only
  - `getLifecycleFactories()` — internal only
  - `getLifecycleFunctions()` — internal only
  - `getMiddlewareFactories()` — internal only
  - `getMiddlewareFunctions()` — internal only

  **Plugin Development API:**

  The following methods are now documented for plugin authors:
  - `matchPath()` — match URL path to route state
  - `makeState()` — create State with custom `meta.id`
  - `buildState()` — validate route and build state
  - `forwardState()` — resolve forwarding and merge default params
  - `navigateToState()` — navigate with pre-built State
  - `setRootPath()` — dynamically modify router base path
  - `getRootPath()` — read current base path

  ### Internal Changes
  - Moved validation logic from namespaces to Router facade
  - Namespace methods now trust validated input from facade

  Closes #36

### @real-router/browser-plugin@0.1.7

### Patch Changes

- [`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777) Thanks [@greydragon888](https://github.com/greydragon888)! - Updated to use Plugin Development API

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/helpers@0.1.7

### Patch Changes

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/logger-plugin@0.2.7

### Patch Changes

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/persistent-params-plugin@0.1.7

### Patch Changes

- [`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777) Thanks [@greydragon888](https://github.com/greydragon888)! - Updated to use Plugin Development API

- Updated dependencies [[`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/core@0.4.0

### @real-router/react@0.1.7

### Patch Changes

- Updated dependencies [[`402c61c`](https://github.com/greydragon888/real-router/commit/402c61c68e62e50cf69af15bd7ff0e4ed5563777), [`338d6ed`](https://github.com/greydragon888/real-router/commit/338d6ed2a2f8aba246cfc81fd30d996f18096572)]:
  - @real-router/browser-plugin@0.1.7
  - @real-router/core@0.4.0
  - @real-router/helpers@0.1.7

## [2026-01-28]

### @real-router/core@0.3.0

### Minor Changes

- [#34](https://github.com/greydragon888/real-router/pull/34) [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Move Router-dependent types from `@real-router/types` to `@real-router/core` (#31)

  Types moved to `@real-router/core`:
  - `Router` (class replaces interface)
  - `Route`
  - `RouteConfigUpdate`
  - `ActivationFnFactory`
  - `MiddlewareFactory`
  - `PluginFactory`
  - `BuildStateResultWithSegments`

  **Migration:** If you import these types from `@real-router/types`, change your imports to `@real-router/core`:

  ```diff
  - import type { Router, Route, PluginFactory } from "@real-router/types";
  + import type { Router, Route, PluginFactory } from "@real-router/core";
  ```

  This change eliminates circular type dependencies between packages.

- [`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd) Thanks [@greydragon888](https://github.com/greydragon888)! - Refactor internal architecture to namespace-based design (#34)

  Internal refactoring from functional decorator composition to class-based namespace architecture:
  - 11 namespace classes with true encapsulation via private fields (`#`)
  - Clean separation of concerns (Options, Dependencies, State, Routes, Navigation, etc.)
  - Improved maintainability and testability

  **No breaking changes** — public API remains 100% backward compatible.

### Patch Changes

- Updated dependencies [[`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/types@0.2.0

### @real-router/types@0.2.0

### Minor Changes

- [#34](https://github.com/greydragon888/real-router/pull/34) [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f) Thanks [@greydragon888](https://github.com/greydragon888)! - **BREAKING:** Move Router-dependent types from `@real-router/types` to `@real-router/core` (#31)

  Types moved to `@real-router/core`:
  - `Router` (class replaces interface)
  - `Route`
  - `RouteConfigUpdate`
  - `ActivationFnFactory`
  - `MiddlewareFactory`
  - `PluginFactory`
  - `BuildStateResultWithSegments`

  **Migration:** If you import these types from `@real-router/types`, change your imports to `@real-router/core`:

  ```diff
  - import type { Router, Route, PluginFactory } from "@real-router/types";
  + import type { Router, Route, PluginFactory } from "@real-router/core";
  ```

  This change eliminates circular type dependencies between packages.

### @real-router/logger@0.2.0

### Minor Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

### @real-router/logger@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### @real-router/browser-plugin@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/browser-plugin@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/browser-plugin@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/browser-plugin@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/logger@0.2.0

### @real-router/browser-plugin@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/core@0.2.4

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

### @real-router/core@0.2.3

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

### @real-router/core@0.2.2

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/logger@0.2.0

### @real-router/core@0.2.1

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

### @real-router/helpers@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/helpers@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/helpers@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/helpers@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2

### @real-router/helpers@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/logger-plugin@0.2.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/logger-plugin@0.2.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/logger-plugin@0.2.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/logger-plugin@0.2.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2
  - @real-router/logger@0.2.0

### @real-router/logger-plugin@0.2.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/persistent-params-plugin@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0

### @real-router/persistent-params-plugin@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4

### @real-router/persistent-params-plugin@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3

### @real-router/persistent-params-plugin@0.1.3

### Patch Changes

- fix: bundle internal dependencies, publish logger package
  - Make logger public as @real-router/logger
  - Bundle type-guards, route-tree, search-params into consuming packages
  - Use dts-bundle-generator for TypeScript declarations (inlines all types)
  - Update release workflow to publish logger first

  This fixes installation failures where npm couldn't resolve workspace-only packages.

- Updated dependencies []:
  - @real-router/core@0.2.2

### @real-router/persistent-params-plugin@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1

### @real-router/react@0.4.0

### Minor Changes

- Migrate to Promise-based navigation API

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0

### @real-router/react@0.1.6

### Patch Changes

- Updated dependencies [[`f6449e2`](https://github.com/greydragon888/real-router/commit/f6449e27ae65deb4cd99afb4b98dcce1deb0ddcd), [`3cd1024`](https://github.com/greydragon888/real-router/commit/3cd10240f69747b0bf489e55a5fdd40eab95bb8f)]:
  - @real-router/core@0.3.0
  - @real-router/browser-plugin@0.1.6
  - @real-router/helpers@0.1.6

### @real-router/react@0.1.5

### Patch Changes

- [#28](https://github.com/greydragon888/real-router/pull/28) [`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: use @real-router/types for shared type definitions

  All packages now import types from @real-router/types instead of bundling
  their own copies. This fixes TypeScript type compatibility issues when
  using multiple @real-router packages together.

- Updated dependencies [[`bfd2e5a`](https://github.com/greydragon888/real-router/commit/bfd2e5a560fa7ab701d9f59b4ea09c3779830c83)]:
  - @real-router/core@0.2.4
  - @real-router/browser-plugin@0.1.5
  - @real-router/helpers@0.1.5

### @real-router/react@0.1.4

### Patch Changes

- [`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies to actual versions

  Previous release published packages with unresolved workspace:^ protocol
  in dependencies, causing npm install to fail. This release fixes the
  issue by using pnpm publish which correctly converts workspace references.

- Updated dependencies [[`1319fb1`](https://github.com/greydragon888/real-router/commit/1319fb11de379534f213da091b6c190a7b6be46b)]:
  - @real-router/core@0.2.3
  - @real-router/browser-plugin@0.1.4
  - @real-router/helpers@0.1.4

### @real-router/react@0.1.3

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

### @real-router/react@0.1.2

### Patch Changes

- [`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c) Thanks [@greydragon888](https://github.com/greydragon888)! - fix: resolve workspace:^ dependencies correctly in published packages

  Previously, workspace:^ dependencies were published to npm as-is, causing
  installation failures. Now workspace protocols are replaced with actual
  version numbers before publishing.

- Updated dependencies [[`5f59ef3`](https://github.com/greydragon888/real-router/commit/5f59ef3f72ad3f26346c0e3e821822cc4fde120c)]:
  - @real-router/core@0.2.1
  - @real-router/browser-plugin@0.1.2
  - @real-router/helpers@0.1.2

## [2026-01-24]

### @real-router/core@0.2.0

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

### @real-router/core@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - core-types@0.1.0
  - route-tree@0.1.0

### @real-router/logger-plugin@0.2.0

### Minor Changes

- [#12](https://github.com/greydragon888/real-router/pull/12) [`50b7619`](https://github.com/greydragon888/real-router/commit/50b76194dd27a143d156416de751fca3e314f68b) Thanks [@greydragon888](https://github.com/greydragon888)! - Add performance tracking to logger-plugin

  ### New Features

  **Timing Display** — transition duration with adaptive units:

  ```
  Transition success (15.00ms)   // normal transitions
  Transition success (27.29μs)   // fast transitions (<0.1ms)
  ```

  **Performance API Integration** — marks and measures for browser DevTools

  ### Configuration

  ```typescript
  router.usePlugin(
    loggerPluginFactory({
      showTiming: true, // default: true
      usePerformanceMarks: true, // default: false
    }),
  );
  ```

### @real-router/logger-plugin@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - logger@0.1.0
  - @real-router/core@0.1.0

### @real-router/browser-plugin@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - @real-router/core@0.1.0

### @real-router/helpers@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/core@0.1.0

### @real-router/persistent-params-plugin@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - type-guards@0.1.0
  - @real-router/core@0.1.0

### @real-router/react@0.1.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0

### @real-router/browser-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/helpers@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/logger-plugin@0.2.1

### Patch Changes

- [#15](https://github.com/greydragon888/real-router/pull/15) [`b83baf1`](https://github.com/greydragon888/real-router/commit/b83baf12f6a4d3e067d1c561ce72195fe9b3bd48) Thanks [@greydragon888](https://github.com/greydragon888)! - Fix logger-plugin configuration options being ignored
  - Replace `logger` singleton with direct `console` calls to make plugin logs independent of router configuration
  - Enable `loggerPluginFactory(options)` to accept configuration parameter
  - Implement `level` option filtering (`all`, `transitions`, `errors`, `none`)
  - Implement `showParamsDiff` option to control parameter diff logging
  - Implement `showTiming` option to control timing information display

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/persistent-params-plugin@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0

### @real-router/react@0.1.1

### Patch Changes

- Updated dependencies [[`ae9e067`](https://github.com/greydragon888/real-router/commit/ae9e06717ed5771e4ff2d67976ad221cb57dfcc6)]:
  - @real-router/core@0.2.0
  - @real-router/browser-plugin@0.1.1
  - @real-router/helpers@0.1.1

## [0.0.1] - 2025-01-20

### Added

Initial release of Real-Router — a complete rewrite and evolution of the router6 project.

#### Public Packages

| Package                                 | Description                                     |
| --------------------------------------- | ----------------------------------------------- |
| `@real-router/core`                     | Core router implementation                      |
| `@real-router/react`                    | React integration (Provider, hooks, components) |
| `@real-router/browser-plugin`           | Browser history and URL synchronization         |
| `@real-router/logger-plugin`            | Development logging with transition tracking    |
| `@real-router/persistent-params-plugin` | Parameter persistence across navigations        |
| `@real-router/helpers`                  | Route comparison and checking utilities         |

#### Core Features

- **TypeScript-first** design with full type safety
- **O(1) route lookup** using Map-based data structures
- **Immutable state** architecture
- **Modern ESM/CJS** builds with tree-shaking support
- **Plugin architecture** for extensibility
- **Middleware support** for navigation pipeline customization
- **Lifecycle guards** (`canActivate` / `canDeactivate`)
- **Observable interface** compatible with RxJS

#### React Integration

- `RouterProvider` — context provider for router instance
- `useRouter` — access router instance
- `useRoute` — subscribe to route changes
- `useRouteNode` — optimized subscription for specific route segments
- `Link` / `ConnectedLink` — navigation components

#### Browser Plugin

- History API integration (pushState / replaceState)
- Hash routing support
- Popstate event handling
- URL building and matching utilities

### Changed

- Renamed all packages from `router6-*` to `@real-router/*`
- Renamed `browserPlugin` to `browserPluginFactory`
- Renamed `loggerPlugin` factory to `loggerPluginFactory`
- Renamed `persistentParamsPlugin` to `persistentParamsPluginFactory`
- Source directory renamed from `modules/` to `src/`

### Migration from router6

If you're migrating from router6 1.0.0:

```diff
- import { createRouter } from "router6";
- import browserPlugin from "router6-plugin-browser";
- import { RouterProvider, useRoute } from "react-router6";
+ import { createRouter } from "@real-router/core";
+ import { browserPluginFactory } from "@real-router/browser-plugin";
+ import { RouterProvider, useRoute } from "@real-router/react";

  const router = createRouter(routes);
- router.usePlugin(browserPlugin());
+ router.usePlugin(browserPluginFactory());
```

---

## History

Real-Router evolved from the router6 project, which was itself a complete rewrite of [router5](https://github.com/router5/router5).

### router6 1.0.0 (2025-01-18)

The final version of router6 before renaming to Real-Router. Key achievements:

- **1.8x to 22x faster** hot-path operations compared to router5
- **O(1) route lookup** instead of O(n) linear search
- Complete TypeScript rewrite with strict type checking
- Modern build system with ESM and CommonJS support

### Acknowledgments

Real-Router is inspired by the declarative routing philosophy of [router5](https://github.com/router5/router5) by Thomas Roch.
