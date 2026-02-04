---
"@real-router/core": minor
---

Add configurable limits via `options.limits` (#38)

Centralize all router limits into a single configuration object:

```typescript
const router = createRouter(routes, {
  limits: {
    maxDependencies: 150,
    maxPlugins: 75,
  },
});

// Read-only access
console.log(router.limits);
// { maxDependencies: 150, maxPlugins: 75, ... }
```

**Limits:**

- `maxDependencies` (default: 100)
- `maxPlugins` (default: 50)
- `maxMiddleware` (default: 50)
- `maxListeners` (default: 10000)
- `maxEventDepth` (default: 5)
- `maxLifecycleHandlers` (default: 200)
