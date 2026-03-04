---
"@real-router/types": minor
---

Add `addBuildPathInterceptor` to `PluginApi` interface (#220)

New method on `PluginApi` allows plugins to register buildPath param interceptors:

```typescript
addBuildPathInterceptor: (
  fn: (routeName: string, params: Params) => Params,
) => Unsubscribe;
```
