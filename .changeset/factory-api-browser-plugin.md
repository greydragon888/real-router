---
"@real-router/browser-plugin": patch
---

Migrate internal PluginApi usage to `getPluginApi()` (#170)

Replaced direct `router.*` PluginApi calls with `api.*` via `getPluginApi(router)` for decoupled plugin architecture. No public API changes.
