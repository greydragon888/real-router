---
"@real-router/core": patch
---

Enforce the lifecycle-handler limit on route-config guards (#961)

- The `maxLifecycleHandlers` hard limit was enforced only on the programmatic path (`getLifecycleApi.addActivateGuard` / `addDeactivateGuard`); guards registered via route config (`getRoutesApi.add` / `update`) bypassed it and only emitted an approaching-limit warning.
- Enforcement is centralized at the `RouteLifecycleNamespace` registration choke point, so every registration path is bounded uniformly and reads the limit from a single source. The hard throw still requires `@real-router/validation-plugin`; without it, behavior is unchanged.
