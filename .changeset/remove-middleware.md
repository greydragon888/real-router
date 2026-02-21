---
"@real-router/core": minor
"@real-router/types": minor
---

Remove middleware layer (#133)

Middleware has been removed as an architectural concept. Use plugins with `onTransitionSuccess` + `router.getRouteConfig()` instead.

**Breaking changes:**

- Removed `router.useMiddleware()`
- Removed `MiddlewareFn`, `Middleware`, `MiddlewareFactory` types
- Removed `maxMiddleware` from `Limits`
- `TransitionPhase` narrowed from `"deactivating" | "activating" | "middleware"` to `"deactivating" | "activating"`

**Migration:**

```typescript
// Before: middleware
router.useMiddleware((router) => (toState, fromState) => {
  const config = router.getRouteConfig(toState.name);
  if (config?.title) document.title = config.title;
});

// After: plugin
router.usePlugin((router) => ({
  onTransitionSuccess: (toState) => {
    const config = router.getRouteConfig(toState.name);
    if (config?.title) document.title = config.title;
  },
}));
```
