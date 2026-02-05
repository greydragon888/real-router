---
"@real-router/core": minor
---

Add configurable limits via `options.limits` (#38)

All router limits are now centralized into a single configuration object. Previously, limits were hardcoded in individual namespaces.

```typescript
const router = createRouter(routes, {
  limits: {
    maxDependencies: 150,
    maxPlugins: 75,
  },
});

// Read-only access
console.log(router.limits);
// { maxDependencies: 150, maxPlugins: 75, maxMiddleware: 50, ... }
```

**Available limits:**

| Limit | Default | Description |
|-------|---------|-------------|
| `maxDependencies` | 100 | Maximum registered dependencies |
| `maxPlugins` | 50 | Maximum registered plugins |
| `maxMiddleware` | 50 | Maximum middleware functions |
| `maxListeners` | 10000 | Maximum event listeners per event type |
| `maxEventDepth` | 5 | Maximum nested event propagation depth |
| `maxLifecycleHandlers` | 200 | Maximum canActivate/canDeactivate handlers |
