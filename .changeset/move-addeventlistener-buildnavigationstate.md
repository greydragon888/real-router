---
"@real-router/core": minor
---

Move `addEventListener` and `buildNavigationState` from Router to `getPluginApi()` (#182)

**Breaking Change:** `router.addEventListener()` and `router.buildNavigationState()` are removed from the Router class. Use `getPluginApi(router)` instead.

**Migration:**

```diff
- router.addEventListener("transitionSuccess", handler);
+ import { getPluginApi } from "@real-router/core";
+ getPluginApi(router).addEventListener("transitionSuccess", handler);
```

```diff
- const state = router.buildNavigationState("users", { id: "123" });
+ import { getPluginApi } from "@real-router/core";
+ const state = getPluginApi(router).buildNavigationState("users", { id: "123" });
```
