---
"@real-router/core": minor
---

Implement `extendRouter()` in `getPluginApi()` with conflict detection and dispose cleanup (#231)

`getPluginApi(router).extendRouter(extensions)` adds properties to the router instance and returns an unsubscribe function that removes them. Throws `PLUGIN_CONFLICT` if any key already exists on the router. `router.dispose()` automatically cleans up any extensions that plugins failed to remove in their `teardown`.
