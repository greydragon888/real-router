# @real-router/react

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

## 1.0.0

### Patch Changes

- Updated dependencies [[`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7), [`2331396`](https://github.com/greydragon888/real-router/commit/233139695878503b2ddec01dab8fafa5ea150ba7)]:
  - @real-router/core@0.18.0
  - @real-router/browser-plugin@0.3.0
  - @real-router/helpers@0.1.21

## 1.0.0

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

## 1.0.0

### Minor Changes

- Initial public release with full routing functionality

### Patch Changes

- Updated dependencies []:
  - @real-router/browser-plugin@0.1.0
  - @real-router/helpers@0.1.0
  - @real-router/core@0.1.0
