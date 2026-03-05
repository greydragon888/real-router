---
"@real-router/types": minor
---

Add `extendRouter()` to `PluginApi` interface and `PLUGIN_CONFLICT` error code (#231)

New `extendRouter(extensions)` method on `PluginApi` allows plugins to formally extend the router instance with conflict detection. New `PLUGIN_CONFLICT` error code thrown when a plugin tries to register a property that already exists on the router.
