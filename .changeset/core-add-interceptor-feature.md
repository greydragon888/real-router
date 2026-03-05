---
"@real-router/core": minor
---

Replace per-method interceptor APIs with universal `addInterceptor` (#224)

**BREAKING CHANGE:** `addBuildPathInterceptor`, `setForwardState`, and `getForwardState` have been replaced with a single `addInterceptor(method, fn)` API. New interceptable method `start` added for browser-plugin to call `router.start()` without arguments.

**Migration:**

```diff
- api.addBuildPathInterceptor(fn);
+ api.addInterceptor('buildPath', (next, route, params) => next(route, modifiedParams));

- api.setForwardState(fn);
+ api.addInterceptor('forwardState', (next, name, params) => next(name, params));
```
