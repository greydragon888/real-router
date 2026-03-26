# ssr-data-plugin

## 0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

## 1.0.0

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
