---
"@real-router/types": minor
---

Add `LimitsConfig` interface and `limits` option (#38)

New `LimitsConfig` interface defines 6 configurable router limits:
- `maxDependencies`, `maxPlugins`, `maxMiddleware`
- `maxListeners`, `maxEventDepth`, `maxLifecycleHandlers`

The `Options` interface now includes `limits?: Partial<LimitsConfig>`.
