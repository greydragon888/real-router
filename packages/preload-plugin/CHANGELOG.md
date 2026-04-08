# @real-router/preload-plugin

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
