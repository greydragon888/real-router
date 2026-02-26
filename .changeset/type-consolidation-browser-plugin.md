---
"@real-router/browser-plugin": patch
---

Adapt plugin function to `PluginFactory` interface change (#184)

Internal: plugin function parameter now inferred from `PluginFactory` (Router interface) instead of annotated with Router class. Cast to augmented Router for browser-specific properties.
