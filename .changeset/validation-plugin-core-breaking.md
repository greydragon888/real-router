---
"@real-router/core": minor
---

Breaking: remove `noValidate` option — validation is now opt-in via plugin

The `noValidate: true` router option has been removed. Validation is now disabled by default and enabled by registering `@real-router/validation-plugin`.

**Before:**

```typescript
const router = createRouter(routes, { noValidate: true }); // disable validation
```

**After:**

```typescript
const router = createRouter(routes); // validation off by default
router.usePlugin(validationPlugin()); // opt in
```

Core now ships with lightweight crash guards only (`guardDependencies`, `guardRouteStructure`). Full DX validation (descriptive errors, argument shape checks, forwardTo cycle detection) requires the plugin.

The `resolveForwardChain` function is now always used in `refreshForwardMap` (previously conditional on `noValidate`). This is a behavioral change: forward chain resolution now always runs, which is the correct behavior.
