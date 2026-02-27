---
"@real-router/core": minor
---

Switch `getRoutesApi` to standalone via WeakMap and remove Route CRUD methods from Router (#174)

**Breaking Change:** Route CRUD methods removed from the `Router` class. Use `getRoutesApi(router)` instead.

**Removed methods:** `addRoute`, `removeRoute`, `updateRoute`, `clearRoutes`, `getRoute`, `getRouteConfig`, `hasRoute`.

**Migration:**

```diff
- router.addRoute({ name: "users", path: "/users" });
- router.removeRoute("users");
+ import { getRoutesApi } from "@real-router/core";
+ const routes = getRoutesApi(router);
+ routes.add({ name: "users", path: "/users" });
+ routes.remove("users");
```

Internally, CRUD logic extracted from `RoutesNamespace` into standalone `routesCrud.ts` for tree-shaking — only included in the bundle when `getRoutesApi()` is imported. Static validator delegates removed from `RoutesNamespace` in favor of direct imports from `validators.ts`.

Heavy operations (`commitTreeChanges`, `rebuildTreeInPlace`, `refreshForwardMap`, `registerAllRouteHandlers`, `nodeToDefinition`, `validateRoutes`) injected via `RoutesStore.ops` — breaks the static import chain `routesCrud.ts → routeTreeOps.ts → route-tree`, reducing `getRoutesApi` standalone bundle from 10.17 kB to 4.04 kB brotli (-60%).
