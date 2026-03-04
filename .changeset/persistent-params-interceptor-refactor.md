---
"@real-router/persistent-params-plugin": patch
---

Replace `buildPath` monkey patching with `addBuildPathInterceptor` (#220)

Migrated from direct `router.buildPath = ...` override to `api.addBuildPathInterceptor()`. No public API changes — internal implementation only.
