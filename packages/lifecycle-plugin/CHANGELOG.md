# @real-router/lifecycle-plugin

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
