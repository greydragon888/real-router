---
"@real-router/validation-plugin": patch
---

Fix retrospective dependency-count off-by-one that broke cloneRouter at the limit (#1225)

The retrospective limits pass used `depCount >= maxDependencies`, but the live limiter (`validateDependencyCount`) counts **before** the insert — so a store may legally REACH exactly `maxDependencies`. Because the retrospective re-runs on `usePlugin` and on every `cloneRouter()`, it rejected a state it had itself allowed to be reached, making every SSR per-request clone of an at-limit base throw `RangeError`. Changed `>=` to `>` so an at-limit store passes and only a store that *strictly exceeds* the limit throws; the message now reads "exceeds" instead of "reaches or exceeds".
