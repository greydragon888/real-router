---
"@real-router/core": minor
---

Add `excludeContext` option to `serializeRouterState` for non-JSON-serializable plugin namespaces (#566)

New optional second parameter `{ excludeContext?: readonly string[] }` strips named namespaces from the serialized JSON. Required by `@real-router/rsc-server-plugin` (which writes `ReactNode` to `state.context.rsc`), but useful for any plugin publishing non-JSON-serializable values.

Backward compatible: omitting the second argument preserves existing behavior.
