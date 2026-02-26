---
"@real-router/core": minor
---

Extract guard management methods into `getLifecycleApi` (#183)

**Breaking Change:** Guard registration methods removed from the `Router` class. Use `getLifecycleApi(router)` instead.

**Removed methods:** `addActivateGuard`, `addDeactivateGuard`, `removeActivateGuard`, `removeDeactivateGuard`.

**Migration:**

```diff
- router.addActivateGuard("admin", guardFactory);
- router.removeActivateGuard("admin");
+ import { getLifecycleApi } from "@real-router/core";
+ const lifecycle = getLifecycleApi(router);
+ lifecycle.addActivateGuard("admin", guardFactory);
+ lifecycle.removeActivateGuard("admin");
```

`canNavigateTo` remains on the Router class — it is a sync UI query method used in hot-path rendering.
