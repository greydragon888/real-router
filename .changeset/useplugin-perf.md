---
"@real-router/core": patch
---

Optimize `usePlugin()` for single-plugin calls

Skip array/Set allocation when registering a single plugin.
