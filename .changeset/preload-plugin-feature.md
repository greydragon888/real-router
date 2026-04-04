---
"@real-router/preload-plugin": minor
---

Add `@real-router/preload-plugin` — preloading on navigation intent (#402)

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
