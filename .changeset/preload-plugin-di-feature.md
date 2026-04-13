---
"@real-router/preload-plugin": minor
---

Add DI access to preload hook via factory pattern (#439)

**Breaking Change:** `preload` in route config is now a factory function `(router, getDependency) => preloadFn` instead of a plain function `(params) => Promise<unknown>`.

**Migration:**
```diff
- preload: (params) => fetch(`/api/${params.id}`)
+ preload: () => (params) => fetch(`/api/${params.id}`)
```

With DI:
```typescript
preload: (_router, getDep) => (params) => {
  return getDep("apiClient").prefetch(params.id);
}
```
