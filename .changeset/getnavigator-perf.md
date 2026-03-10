---
"@real-router/core": patch
---

Cache `getNavigator()` result per router via `WeakMap` (#271)

`getNavigator()` no longer allocates a new frozen object on every call. A module-level `WeakMap<Router, Navigator>` cache ensures one navigator per router instance. `WeakMap` does not prevent garbage collection of the router.
