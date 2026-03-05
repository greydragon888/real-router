---
"@real-router/core": minor
---

Replace per-method interceptor APIs with universal `addInterceptor` (#224)

**BREAKING CHANGE:** `addStartInterceptor`, `addNavigateInterceptor`, and other per-method interceptor methods have been replaced with a single `addInterceptor(method, fn)` API.

**Migration:**

```diff
- api.addStartInterceptor((args, next) => next(args));
+ api.addInterceptor('start', (args, next) => next(args));

- api.addNavigateInterceptor((args, next) => next(args));
+ api.addInterceptor('navigate', (args, next) => next(args));
```
