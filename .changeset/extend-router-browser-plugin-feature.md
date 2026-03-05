---
"@real-router/browser-plugin": minor
---

Migrate `browser-plugin` to use `extendRouter()` for formal router extension (#231)

Replaces manual property assignment (`router.buildUrl = ...`) and deletion (`delete router.buildUrl`) with the new `extendRouter()` API. Extensions are now automatically cleaned up via the returned unsubscribe function in `teardown`.
