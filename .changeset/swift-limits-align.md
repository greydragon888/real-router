---
"@real-router/validation-plugin": patch
---

Enforce the lifecycle-handler limit on route-config guards (#961)

- `validateHandlerLimit` now reads `maxLifecycleHandlers` from the router options — the same source as the approaching-limit warning — instead of a caller-supplied value. Combined with the core change, the hard throw now fires for guards registered via route config, not just the programmatic API.
