---
"@real-router/core": patch
---

Optimize `usePlugin()` for single-plugin calls (#53)

Skip array/Set allocation when registering a single plugin.
