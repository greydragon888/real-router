# @real-router/preload-plugin

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
