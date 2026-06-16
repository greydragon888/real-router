# @real-router/preload-plugin

## 0.5.1

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.5.0

### Minor Changes

- [#717](https://github.com/greydragon888/real-router/pull/717) [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae) Thanks [@greydragon888](https://github.com/greydragon888)! - Invalidate preload caches on route-tree mutations via TREE_CHANGED ([#702](https://github.com/greydragon888/real-router/issues/702))

  The plugin now subscribes to `getRoutesApi(router).subscribeChanges()` and, on
  `remove`/`replace`/`clear`:
  - **Fixes a stale pre-resolved `State` bug**: the href-keyed snapshot cache
    (consumed via `router.getPreloadedState(href)`) is now cleared on structural
    mutations. Previously a `<FastLink>` could read a cached `State` for a route
    that had since been removed/changed and commit it via `navigateToState`,
    navigating to a route no longer in the tree.
  - Drops `#compiledPreloads` entries for removed routes (previously unreachable
    dead memory until teardown — `matchUrl` never resolves a removed route).

  `add`/`update` still rely on lazy factory-reference revalidation; runtime preload
  behavior on a stable tree is unchanged. The subscription is removed in `teardown`.

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.4.0

### Minor Changes

- [#564](https://github.com/greydragon888/real-router/pull/564) [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a) Thanks [@greydragon888](https://github.com/greydragon888)! - preload-plugin: cache pre-resolved State on hover, expose via `router.getPreloadedState(href)` ([#562](https://github.com/greydragon888/real-router/issues/562))

  When `mouseover`/`touchstart` resolves an anchor's URL through `router.matchUrl`, the resulting `State` is now cached internally by `href` in a small bounded Map (limit 32, insertion-order eviction). Consumers can read it via the new router extension:

  ```ts
  const cachedState = router.getPreloadedState?.(anchor.href);
  if (cachedState) {
    getPluginApi(router).navigateToState(cachedState, { replace: false });
  } else {
    router.navigate(routeName, params);
  }
  ```

  **Single-use semantics** — the entry is deleted on read so the consumer never re-uses a stale snapshot. Re-hovering the same anchor repopulates the cache.

  **Snapshot semantics** match `memory-plugin` post-[#561](https://github.com/greydragon888/real-router/issues/561) and URL plugins post-[#525](https://github.com/greydragon888/real-router/issues/525): activation guards still run on commit, but `forwardState`/`buildPath` interceptors do not re-fire (they ran when the cached State was minted via `matchPath`). For consumers relying on dynamic interceptors, fall back to `router.navigate(name, params)`.

  **Cache populated even without `preload` factory** — the State is useful for fast navigation independently of preload.

  **Cleared on `onStop` and `teardown`.** The `getPreloadedState` extension is removed in `teardown`.

  This is a plugin-only change. No framework adapters were modified — apps that want the optimization wrap `<Link>` in a custom `<FastLink>` consumer (recipe in the wiki).

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/types@0.35.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.3.0

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
