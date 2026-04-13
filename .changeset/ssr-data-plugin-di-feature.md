---
"@real-router/ssr-data-plugin": minor
---

Add DI access to data loaders via factory pattern (#439)

**Breaking Change:** `DataLoaderMap` is replaced by `DataLoaderFactoryMap`. Loaders are now factory functions `(router, getDependency) => loaderFn` instead of plain functions `(params) => Promise<unknown>`.

**Migration:**
```diff
- const loaders: DataLoaderMap = {
-   "users.profile": (params) => fetchUser(params.id),
+ const loaders: DataLoaderFactoryMap = {
+   "users.profile": () => (params) => fetchUser(params.id),
  };
```

With DI:
```typescript
const loaders: DataLoaderFactoryMap = {
  "users.profile": (_router, getDep) => (params) => {
    return getDep("db").query("SELECT * FROM users WHERE id = ?", params.id);
  },
};
```
