---
"@real-router/core": patch
---

Simplify error routing and consolidate namespace DI (#244)

Internal refactoring with no public API changes:

- Merge `sendTransitionBlocked` + `sendTransitionError` into single `sendTransitionFail`
- Apply `send*`/`emit*` naming convention to EventBusNamespace methods
- Eliminate `TransitionDependencies` interface, merge into `NavigationDependencies`
- Replace `setRouter()` + `getDependency` with `compileFactory` in RouteLifecycle and Plugins namespaces
- Extract `throwIfDisposed` to shared `api/helpers.ts`
- Move guard-checking loop from `Router.canNavigateTo()` to `RouteLifecycleNamespace.canNavigateTo()`
- Merge `resolveDefaultRoute` + `resolveDefaultParams` into `resolveDefault()`
