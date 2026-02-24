---
"@real-router/core": minor
---

Add factory functions as parallel API for plugin/route access (#170)

New factory functions that provide decoupled access to router internals:

- `getPluginApi(router)` — returns `PluginApi` with `makeState`, `buildState`, `matchPath`, `navigateToState`, etc.
- `getRoutesApi(router)` — returns `RoutesApi` with `addRoute`, `removeRoute`, `getTree`, etc.
- `getDependenciesApi(router)` — returns `DependenciesApi` with `getDependency`, `setDependency`
- `cloneRouter(router)` — clones router for SSR

All functions use eager capture (copy method references at call time). Existing `router.*` methods are preserved — this is a non-breaking addition.
