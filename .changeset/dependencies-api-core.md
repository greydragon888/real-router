---
"@real-router/core": minor
---

Switch `getDependenciesApi` to standalone via WeakMap and remove DI methods from Router (#172)

**Breaking Change:** DI methods removed from the `Router` class. Use `getDependenciesApi(router)` instead.

**Removed methods:** `setDependency`, `setDependencies`, `removeDependency`, `resetDependencies`, `hasDependency`, `getDependency`, `getDependencies`.

**Migration:**

```diff
- router.setDependency("api", apiService);
- const dep = router.getDependency("api");
+ import { getDependenciesApi } from "@real-router/core";
+ const deps = getDependenciesApi(router);
+ deps.set("api", apiService);
+ const dep = deps.get("api");
```

`getDependency` remains available internally via factory injection (`PluginFactory`, `GuardFnFactory`, `ForwardToCallback`).
