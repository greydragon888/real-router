---
"@real-router/core": minor
---

Move `getRouteConfig` from `getRoutesApi` to `getPluginApi` (#320)

**Breaking Change:** `getRouteConfig()` is no longer available on the object returned by `getRoutesApi(router)`. Use `getPluginApi(router).getRouteConfig(routeName)` instead.

`getRouteConfig` reads custom route config fields — a tool for **plugins**, not for route CRUD operations. Moving it to `getPluginApi` reflects its actual purpose: enabling config-driven plugins that read `title`, `loadData`, and other custom fields from route definitions.

**Migration:**
```diff
- import { getRoutesApi } from "@real-router/core/api";
- const config = getRoutesApi(router).getRouteConfig("users");
+ import { getPluginApi } from "@real-router/core/api";
+ const config = getPluginApi(router).getRouteConfig("users");
```
