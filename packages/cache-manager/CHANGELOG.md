# @real-router/cache-manager

## 0.2.0

### Minor Changes

- [#164](https://github.com/greydragon888/real-router/pull/164) [`9143703`](https://github.com/greydragon888/real-router/commit/91437035286276402aad3a3cde86b4eb8253063d) Thanks [@greydragon888](https://github.com/greydragon888)! - Create `@real-router/cache-manager` package (#158)

  Centralized cache registry with LRU eviction for real-router. Exports two primitives:
  - **`KeyIndexCache<T>`** — generic LRU cache (`get`, `invalidateMatching`, `getMetrics`, `clear`)
  - **`CacheManager`** — dynamic registry of `KeyIndexCache` instances with coordinated invalidation and aggregated metrics
  - **`cacheManager`** — module-level singleton (same pattern as `@real-router/logger`)
