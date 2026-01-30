---
"@real-router/core": minor
---

## Public API Audit — Remove Legacy Internal Methods

### Breaking Changes

**Removed methods:**
- `isStarted()` — use `isActive()` instead
- `isNavigating()` — track via middleware/events if needed
- `forward()` — use `forwardTo` option in route config
- `setState()` — internal only, use `navigate()` or `navigateToState()`
- `areStatesDescendants()` — use `state2.name.startsWith(state1.name + ".")`
- `clearCanActivate()` — override with `canActivate(name, true)`
- `clearCanDeactivate()` — override with `canDeactivate(name, true)`
- `removeEventListener()` — use unsubscribe function from `addEventListener()`
- `makeNotFoundState()` — use `navigateToDefault()` or handle in middleware
- `getPlugins()` — track plugins in application code if needed
- `invokeEventListeners()` — internal only
- `hasListeners()` — internal only
- `getLifecycleFactories()` — internal only
- `getLifecycleFunctions()` — internal only
- `getMiddlewareFactories()` — internal only
- `getMiddlewareFunctions()` — internal only

**Plugin Development API:**

The following methods are now documented for plugin authors:
- `matchPath()` — match URL path to route state
- `makeState()` — create State with custom `meta.id`
- `buildState()` — validate route and build state
- `forwardState()` — resolve forwarding and merge default params
- `navigateToState()` — navigate with pre-built State
- `setRootPath()` — dynamically modify router base path
- `getRootPath()` — read current base path

### Internal Changes

- Moved validation logic from namespaces to Router facade
- Namespace methods now trust validated input from facade

Closes #36
