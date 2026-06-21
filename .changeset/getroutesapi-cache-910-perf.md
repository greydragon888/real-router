---
"@real-router/core": patch
---

Cache `getRoutesApi` per router (#910)

`getRoutesApi(router)` now returns a stable, per-router cached instance (keyed by a `WeakMap`), mirroring `getPluginApi` / `getNavigator`. Avoids re-allocating the API closure bag on repeat calls and gives callers a stable object identity.
