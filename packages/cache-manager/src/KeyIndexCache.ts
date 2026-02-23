import type { CacheInstance, CacheMetrics } from "./types.js";

export class KeyIndexCache<T> implements CacheInstance<T> {
  readonly #cache = new Map<string, T>();
  readonly #maxSize: number;
  #hits = 0;
  #misses = 0;

  constructor(maxSize: number) {
    if (maxSize <= 0 || !Number.isInteger(maxSize)) {
      throw new Error(
        `KeyIndexCache: maxSize must be a positive integer, got ${maxSize}`,
      );
    }

    this.#maxSize = maxSize;
  }

  /**
   * Retrieve a cached value or compute and store it.
   *
   * On hit: returns cached value directly (no reordering — FIFO eviction).
   * On miss: calls `compute()`, stores result with FIFO eviction if full.
   *
   * Consumers: transitionPath (path cache), RouteUtils (nodeState cache), plugins.
   */
  get(key: string, compute: () => T): T {
    const cached = this.#cache.get(key);

    if (cached !== undefined) {
      this.#hits++;

      return cached;
    }

    // Disambiguate undefined-as-value from cache miss
    if (this.#cache.has(key)) {
      this.#hits++;

      return undefined as T;
    }

    this.#misses++;
    const value = compute();

    if (this.#cache.size >= this.#maxSize) {
      const { value: oldestKey } = this.#cache
        .keys()
        .next() as IteratorYieldResult<string>;

      this.#cache.delete(oldestKey);
    }

    this.#cache.set(key, value);

    return value;
  }

  /**
   * Remove all entries whose key matches the predicate.
   *
   * Consumer: transitionPath `onInvalidate` — smart invalidation that removes
   * only entries referencing newly added route names instead of clearing all.
   */
  invalidateMatching(predicate: (key: string) => boolean): void {
    for (const key of this.#cache.keys()) {
      if (predicate(key)) {
        this.#cache.delete(key);
      }
    }
  }

  /**
   * Return hit/miss statistics and current cache utilization.
   *
   * Consumer: CacheManager.getMetrics() aggregates these for DevTools.
   */
  getMetrics(): CacheMetrics {
    const total = this.#hits + this.#misses;

    return {
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total > 0 ? this.#hits / total : 0,
      size: this.#cache.size,
      maxSize: this.#maxSize,
    };
  }

  /**
   * Remove all entries and reset statistics.
   *
   * Consumers: CacheManager.clear() (router.dispose, tests/SSR setup),
   * CacheManager.invalidateForNewRoutes() (default when no onInvalidate).
   */
  clear(): void {
    this.#cache.clear();
    this.#hits = 0;
    this.#misses = 0;
  }
}
