---
"@real-router/types": minor
---

Remove `add` from `InterceptableMethodMap` (#702)

**Breaking change:** `addInterceptor("add", fn)` is no longer available. The only
consumer (`@real-router/search-schema-plugin`) migrated to the `TREE_CHANGED`
subscription (`getRoutesApi(router).subscribeChanges`), which also covers
`update`/`remove`/`replace`/`clear`. Use `subscribeChanges` to react to dynamic
route additions instead.
