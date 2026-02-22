---
"@real-router/core": patch
---

Pre-compute `buildParamNamesSet` at route registration time (#142)

Eliminate per-call `Set` and `Array` allocations in `buildPath()` loose mode by pre-computing URL param names during route registration.
