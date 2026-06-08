---
"@real-router/core": minor
---

Remove the dead `add` interceptable wrapper (#702)

**Breaking change:** `getRoutesApi(router).add` is no longer wrapped in the
interceptor chain — `addInterceptor("add", fn)` has no effect (the `add` key was
removed from `InterceptableMethodMap`). The sole consumer migrated to
`subscribeChanges`. `add()` now calls the internal `addRoutes` directly, removing
the per-call interceptor lookup. No change to `add()`'s public behavior or
signature.
