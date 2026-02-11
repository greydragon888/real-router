---
"@real-router/core": minor
"@real-router/core-types": minor
---

Guard API improvements and route accessibility checks (#42)

## New Methods

### Guard Registration (Renamed)

- **`addActivateGuard(name, guard)`** — Replaces deprecated `canActivate()`. Registers activation guard for a route.
- **`addDeactivateGuard(name, guard)`** — Replaces deprecated `canDeactivate()`. Registers deactivation guard for a route.

### Guard Removal (New)

- **`removeActivateGuard(name)`** — Removes previously registered activation guard.
- **`removeDeactivateGuard(name)`** — Removes previously registered deactivation guard.

### Route Accessibility Check (New)

- **`canNavigateTo(name, params?)`** — Synchronously checks if navigation to a route would be allowed by guards. Returns `boolean`. Useful for RBAC, conditional rendering, menu filtering.

### Navigator Interface (Enhanced)

- **`getNavigator()`** — Now returns Navigator with 5 methods (added `canNavigateTo` as 5th method). Existing methods: `navigate`, `getState`, `isActiveRoute`, `subscribe`.

## Deprecations

- **`canActivate(name, guard)`** — Deprecated. Use `addActivateGuard()` instead. Emits console warning.
- **`canDeactivate(name, guard)`** — Deprecated. Use `addDeactivateGuard()` instead. Emits console warning.

## Breaking Changes 

- Navigator interface now has 5 methods instead of 4 (added `canNavigateTo`). If you're using type assertions on Navigator, update them.
- Router interface in `@real-router/core-types` now includes new method signatures.

## Migration

Use the provided codemod to migrate your code:

```bash
./scripts/codemods/rename-guard-methods.sh --dry-run src/**/*.ts  # Preview
./scripts/codemods/rename-guard-methods.sh src/**/*.ts            # Apply
```

Or manually replace:

- `router.canActivate(...)` → `router.addActivateGuard(...)`
- `router.canDeactivate(...)` → `router.addDeactivateGuard(...)`

**Note:** Route config field `canActivate` in route definitions does NOT change.
