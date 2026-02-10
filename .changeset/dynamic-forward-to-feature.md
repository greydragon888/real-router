---
"@real-router/core": minor
---

Add dynamic `forwardTo` callback support (#43)

`forwardTo` now accepts `string | ForwardToCallback<Dependencies>` — a sync callback receiving `(getDependency, params)` that returns a target route name at navigation time. Enables role-based routing, feature flags, A/B testing, and tenant-specific routing.

- Separate storage: `forwardMap` (static, O(1) cached) + `forwardFnMap` (dynamic, resolved per-navigation)
- Mixed chain support: static-to-dynamic, dynamic-to-static, dynamic-to-dynamic
- Runtime validation: return type, target existence, cycle detection (visited Set, max depth 100)
- Sync-only enforcement: async callbacks rejected at registration (even with `noValidate: true`)
- Full support in `addRoute`, `updateRoute`, `removeRoute`, `clearRoutes`, `clone`, `matchPath`, `buildState`
