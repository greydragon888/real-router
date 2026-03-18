---
"@real-router/types": minor
---

Move `getRouteConfig` type from `RoutesApi` to `PluginApi` interface (#320)

**Breaking Change:** `getRouteConfig` method signature removed from `RoutesApi` interface and added to `PluginApi` interface. Consumers typing against these interfaces must update accordingly.
