---
"@real-router/core": minor
---

Re-export consolidated types from `@real-router/types` (#184)

- Replace factory type and route config definitions in `types.ts` with re-exports from `@real-router/types`
- Replace API interface definitions in `api/types.ts` with re-exports
- Standalone API functions (`getPluginApi`, `getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getNavigator`) now accept `Router` interface instead of class — enables passing interface-typed router values
- `PluginApi.getTree()` returns `unknown` (was `RouteTree`)

All existing imports from `@real-router/core` continue working via re-exports.
