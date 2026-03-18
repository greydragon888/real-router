---
"@real-router/ssr-data-plugin": minor
---

Add `@real-router/ssr-data-plugin` — SSR per-route data loading (#298)

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
