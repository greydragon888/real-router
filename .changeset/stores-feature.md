---
"@real-router/stores": minor
---

Add `@real-router/stores` — framework-agnostic subscription layer for router state (#217)

Three factory functions for UI adapter authors:

- `createRouteStore(router)` — subscribe to all navigations
- `createRouteNodeStore(router, nodeName)` — subscribe to specific route node
- `createActiveRouteStore(router, routeName, params?, options?)` — track route activity
