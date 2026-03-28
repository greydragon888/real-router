# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
