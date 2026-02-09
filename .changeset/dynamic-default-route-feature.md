---
"@real-router/core": minor
"@real-router/types": minor
---

Support dynamic defaultRoute and defaultParams via callback functions

This feature allows `defaultRoute` and `defaultParams` options to be callback functions that receive `getDependency` for dynamic value computation based on router dependencies.

**Breaking Type Change**: `router.getOptions().defaultRoute` now returns `string | DefaultRouteCallback` (was `string`). Similarly, `router.getOptions().defaultParams` now returns `Params | DefaultParamsCallback` (was `Params`). Code that assigns these values to typed variables may need type assertions or `typeof` checks.

**Behavior Note**: A callback returning empty string `""` produces `ROUTE_NOT_FOUND` error (not `NO_START_PATH_OR_STATE`), because the function is truthy at early return checks but resolves to empty.

**Example**:

```typescript
const router = createRouter(routes, {
  defaultRoute: (getDep) =>
    getDep("userRole") === "admin" ? "admin.dashboard" : "home",
  defaultParams: (getDep) => ({ userId: getDep("currentUserId") }),
});
```
