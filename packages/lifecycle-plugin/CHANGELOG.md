# @real-router/lifecycle-plugin

## 0.1.4

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.1.3

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

## 0.1.2

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

## 0.1.1

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

## 0.1.0

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
