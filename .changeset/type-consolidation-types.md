---
"@real-router/types": minor
---

Consolidate Router-dependent types into `@real-router/types` (#184)

- Expand `Router` interface from 6 to 15 methods, make generic `Router<D>`
- Move factory types (`PluginFactory`, `GuardFnFactory`, `ActivationFnFactory`) from `@real-router/core` using interface self-reference
- Move route config types (`Route`, `RouteConfigUpdate`) from `@real-router/core`
- Add `EventMethodMap` type-level computation to constants
- Add API interfaces (`PluginApi`, `RoutesApi`, `DependenciesApi`, `LifecycleApi`) in new `api.ts`

All types are now importable from `@real-router/types` without depending on `@real-router/core`.
