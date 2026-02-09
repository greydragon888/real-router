---
"@real-router/core": minor
---

Support dynamic `defaultRoute` and `defaultParams` via callback functions (#39)

`defaultRoute` and `defaultParams` options now accept callback functions that receive `getDependency` for dynamic value computation based on router dependencies. Callbacks are resolved at point of use (`start()`, `navigateToDefault()`), never cached.

**Breaking Type Change**: `router.getOptions().defaultRoute` now returns `string | DefaultRouteCallback` (was `string`). Similarly, `router.getOptions().defaultParams` now returns `Params | DefaultParamsCallback` (was `Params`). Code that assigns these values to typed variables may need type assertions or `typeof` checks.

**Behavior Note**: A callback returning empty string `""` in `navigateToDefault()` returns noop (no navigation). In `start()` without path, it produces `ROUTE_NOT_FOUND` error (not `NO_START_PATH_OR_STATE`).

```typescript
const router = createRouter(routes, {
  defaultRoute: (getDep) =>
    getDep("userRole") === "admin" ? "admin.dashboard" : "home",
  defaultParams: (getDep) => ({ userId: getDep("currentUserId") }),
});
```
