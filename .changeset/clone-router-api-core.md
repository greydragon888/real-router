---
"@real-router/core": minor
---

Switch `cloneRouter` to standalone via WeakMap and remove `CloneNamespace` from Router (#173)

**Breaking Change:** `Router.clone()` instance method removed. Use `cloneRouter(router, deps?)` instead.

**Removed:** `CloneNamespace` class (3 files), `Router.clone()` method, clone wiring in `RouterWiringBuilder`.

**Migration:**

```diff
- const cloned = router.clone({ api: newApi });
+ import { cloneRouter } from "@real-router/core";
+ const cloned = cloneRouter(router, { api: newApi });
```

`cloneRouter` collects all router data (routes, options, dependencies, guards, plugins, forwardTo, rootPath, middleware) via WeakMap internals and creates a fresh router instance.
