---
"@real-router/persistent-params-plugin": patch
---

Migrate internal PluginApi usage to `getPluginApi()` (#170, #171)

Replaced direct `router.forwardState` monkey-patching with `api.getForwardState()` / `api.setForwardState()` via `getPluginApi(router)` for decoupled plugin architecture. No public API changes.
