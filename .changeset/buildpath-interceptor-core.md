---
"@real-router/core": minor
---

Add `addBuildPathInterceptor` to `PluginApi` (#220)

Plugins can now register buildPath param interceptors via `getPluginApi(router).addBuildPathInterceptor()`. Multiple interceptors execute in FIFO registration order. Each returns an `Unsubscribe` function for safe teardown.

```typescript
const api = getPluginApi(router);
const unsubscribe = api.addBuildPathInterceptor((routeName, params) => {
  return { ...params, lang: getCurrentLang() };
});
```

All `buildPath` call paths (facade, wiring, plugins) go through the interceptor pipeline via `RouterInternals`.
