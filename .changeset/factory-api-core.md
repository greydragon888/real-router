---
"@real-router/core": minor
---

Add factory functions and WeakMap internals for modular plugin access (#170, #171)

**Breaking Change:** PluginApi methods removed from the `Router` class. Use `getPluginApi(router)` instead.

**Removed methods:** `makeState`, `buildState`, `forwardState`, `matchPath`, `setRootPath`, `getRootPath`, `navigateToState`, `addEventListener`, `getOptions`.

**Migration:**

```diff
- const state = router.matchPath("/home");
+ import { getPluginApi } from "@real-router/core";
+ const api = getPluginApi(router);
+ const state = api.matchPath("/home");
```

**New exports:**

- `getPluginApi(router)` — returns `PluginApi` with `makeState`, `buildState`, `matchPath`, `navigateToState`, `addEventListener`, etc.
- `getRoutesApi(router)` — returns `RoutesApi` with `add`, `remove`, `update`, `clear`, `has`
- `getDependenciesApi(router)` — returns `DependenciesApi` with `get`, `set`, `remove`, `reset`, `has`, etc.
- `cloneRouter(router, deps?)` — clones router for SSR

Internally, `getPluginApi` uses a WeakMap-based internals mechanism for decoupled access to router state.
