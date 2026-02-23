# @real-router/cache-manager

## 0.2.1

### Patch Changes

- [#167](https://github.com/greydragon888/real-router/pull/167) [`649c251`](https://github.com/greydragon888/real-router/commit/649c251af331b2b2986c7b8781969904122673dc) Thanks [@greydragon888](https://github.com/greydragon888)! - Replace LRU with FIFO eviction in KeyIndexCache (#165)

  FIFO eliminates `Map.delete()` + `Map.set()` on every cache hit (LRU refresh).
  Hit path is now a single `Map.get()` — 2–3.4× faster than LRU in benchmarks.

  Other optimizations:
  - Inline `#store()` into `get()` (one fewer function call on miss)
  - Replace `#stats` object with separate `#hits`/`#misses` counters (no object allocation on `clear()`)
  - Handle `undefined` as a valid cached value (disambiguate from cache miss)

## 0.2.0

### Minor Changes

- [#164](https://github.com/greydragon888/real-router/pull/164) [`9143703`](https://github.com/greydragon888/real-router/commit/91437035286276402aad3a3cde86b4eb8253063d) Thanks [@greydragon888](https://github.com/greydragon888)! - Create `@real-router/cache-manager` package (#158)

  Centralized cache registry with LRU eviction for real-router. Exports two primitives:
  - **`KeyIndexCache<T>`** — generic LRU cache (`get`, `invalidateMatching`, `getMetrics`, `clear`)
  - **`CacheManager`** — dynamic registry of `KeyIndexCache` instances with coordinated invalidation and aggregated metrics
  - **`cacheManager`** — module-level singleton (same pattern as `@real-router/logger`)
