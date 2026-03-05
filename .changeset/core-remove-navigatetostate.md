---
"@real-router/core": minor
---

Remove `navigateToState` from public `PluginApi` (#227)

**BREAKING CHANGE:** `navigateToState` is no longer available in the plugin API. Plugins should use `router.navigate()` instead, which goes through the full navigation pipeline including middleware, guards, and interceptors.
