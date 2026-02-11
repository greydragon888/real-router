---
"@real-router/core": minor
---

Rename guard API and add route accessibility checks (#42)

## New Methods

- **`addActivateGuard(name, guard)`** — Registers activation guard for a route.
- **`addDeactivateGuard(name, guard)`** — Registers deactivation guard for a route.
- **`removeActivateGuard(name)`** — Removes previously registered activation guard.
- **`removeDeactivateGuard(name)`** — Removes previously registered deactivation guard.
- **`canNavigateTo(name, params?)`** — Synchronously checks if navigation to a route would be allowed by guards. Returns `boolean`.

## Removed (Breaking)

- **`canActivate(name, guard)`** — Removed. Use `addActivateGuard()` instead.
- **`canDeactivate(name, guard)`** — Removed. Use `addDeactivateGuard()` instead.

## Enhanced

- **`getNavigator()`** — Navigator now includes `canNavigateTo` as 5th method.

## Migration

```diff
- router.canActivate('admin', guard)
+ router.addActivateGuard('admin', guard)

- router.canDeactivate('editor', guard)
+ router.addDeactivateGuard('editor', guard)
```

**Note:** Route config field `canActivate` in route definitions does NOT change.
