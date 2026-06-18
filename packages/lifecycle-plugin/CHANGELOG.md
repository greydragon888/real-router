# @real-router/lifecycle-plugin

## 0.5.2

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.5.0

### Minor Changes

- [#717](https://github.com/greydragon888/real-router/pull/717) [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae) Thanks [@greydragon888](https://github.com/greydragon888)! - Evict compiled hooks for removed routes via TREE_CHANGED ([#702](https://github.com/greydragon888/real-router/issues/702))

  The plugin now subscribes to `getRoutesApi(router).subscribeChanges()` and drops
  cached `hookName:routeName` entries for routes removed via `remove`/`replace`
  (and clears the cache on `clear`). Previously those entries were unreachable dead
  memory until teardown. `add`/`update` still rely on lazy factory-reference
  revalidation; hook dispatch behavior is unchanged. A `teardown` was added to
  remove the subscription on unsubscribe.

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.4.7

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.4.6

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.4.5

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/types@0.35.0

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
