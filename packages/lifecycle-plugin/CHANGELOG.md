# @real-router/lifecycle-plugin

## 0.4.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.4.0

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

## 0.3.0

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

## 0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0

## 0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

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
