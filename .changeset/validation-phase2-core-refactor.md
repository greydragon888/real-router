---
"@real-router/core": patch
---

Extract remaining DX validators behind `ctx.validator` and remove `type-guards` from bundle (#334)

Phase 2 of validation extraction: 17 new `RouterValidator` slots, setter injection for `PluginsNamespace` and `RouteLifecycleNamespace`, `type-guards` removed from `noExternal` (no longer bundled). Core bundle reduced by ~3.6 kB (brotli).
