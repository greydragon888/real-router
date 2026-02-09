---
"@real-router/core": patch
---

Optimize `matchPath` by inlining `buildPath` and skipping `defaultParams` re-merge (#63)
