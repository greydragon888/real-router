---
"@real-router/types": minor
---

Remove `navigateToState` from `PluginApi` interface (#224)

**BREAKING CHANGE:** `navigateToState` has been removed from the `PluginApi` interface. Plugins should use `router.navigate()` instead.
