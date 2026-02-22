---
"@real-router/core": minor
---

Remove middleware layer (#133)

**Breaking Change:** Middleware has been removed as an architectural concept.

- Removed `router.useMiddleware()`
- Removed `maxMiddleware` from `Limits`

**Migration:**

Side effects → `plugin.onTransitionSuccess` + `router.getRouteConfig()`:

```typescript
// Before
router.useMiddleware((router) => (toState) => {
  const config = router.getRouteConfig(toState.name);
  if (config?.title) document.title = config.title;
});

// After
router.usePlugin((router) => ({
  onTransitionSuccess: (toState) => {
    const config = router.getRouteConfig(toState.name);
    if (config?.title) document.title = config.title;
  },
}));
```

Redirects → `forwardTo` in route config:

```typescript
// Before
router.useMiddleware((router) => (toState) => {
  if (toState.name === "old") return router.makeState("new");
});

// After
const routes = [{ name: "old", path: "/old", forwardTo: "new" }];
```

Cancellation → `canActivate` / `canDeactivate` guards:

```typescript
// Before
router.useMiddleware(() => (toState) => {
  if (!isAuthenticated()) return false;
});

// After
router.addActivateGuard("admin", () => () => isAuthenticated());
```
