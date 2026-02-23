---
"@real-router/cache-manager": minor
---

Create `@real-router/cache-manager` package (#158)

Centralized cache registry with LRU eviction for real-router. Exports two primitives:

- **`KeyIndexCache<T>`** — generic LRU cache (`get`, `invalidateMatching`, `getMetrics`, `clear`)
- **`CacheManager`** — dynamic registry of `KeyIndexCache` instances with coordinated invalidation and aggregated metrics
- **`cacheManager`** — module-level singleton (same pattern as `@real-router/logger`)
