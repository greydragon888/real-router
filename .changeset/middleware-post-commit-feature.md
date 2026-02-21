---
"@real-router/core": minor
---

Migrate middleware to post-commit fire-and-forget execution (#133)

Middleware now runs **after** state is committed (post-commit), not before. This is a breaking change in middleware semantics:

- **Before**: middleware could block navigation (return `false`), redirect (return `State`), or throw to cancel
- **After**: middleware runs as a fire-and-forget side effect — return values and thrown errors are ignored; navigation always succeeds

**Migration guide:**

```typescript
// BEFORE: middleware blocking/redirecting (no longer works)
router.useMiddleware(() => (toState) => {
  if (!auth) return router.makeState("login"); // redirect — ignored now
  if (!allowed) return false; // block — ignored now
});

// AFTER: use guards for blocking/redirecting
router.addActivateGuard("protected", () => (toState) => {
  return auth; // false blocks navigation
});

// Middleware is now for side effects only
router.useMiddleware(() => (toState) => {
  analytics.track(toState.name); // fire-and-forget side effect
});
```

Also adds `router.getRouteConfig(name)` method to access custom (non-standard) fields from route definitions.
