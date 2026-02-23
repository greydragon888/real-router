import type { CacheInstance, CacheMetrics } from "./types.js";

export class KeyIndexCache<T> implements CacheInstance<T> {
  readonly #cache = new Map<string, T>();
  readonly #maxSize: number;
  #stats: { hits: number; misses: number } = { hits: 0, misses: 0 };

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
   * On hit: refreshes LRU position (Map delete+set moves entry to end).
   * On miss: calls `compute()`, stores result with LRU eviction if full.
   *
   * Consumers: transitionPath (path cache), RouteUtils (nodeState cache), plugins.
   */
  get(key: string, compute: () => T): T {
    if (this.#cache.has(key)) {
      this.#stats.hits++;
      const value = this.#cache.get(key) as T;

      this.#cache.delete(key);
      this.#cache.set(key, value);

      return value;
    }

    this.#stats.misses++;
    const value = compute();

    this.#store(key, value);

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
    const total = this.#stats.hits + this.#stats.misses;

    return {
      hits: this.#stats.hits,
      misses: this.#stats.misses,
      hitRate: total > 0 ? this.#stats.hits / total : 0,
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
    this.#stats = { hits: 0, misses: 0 };
  }

  #store(key: string, value: T): void {
    if (this.#cache.size >= this.#maxSize) {
      // size >= maxSize > 0, so the iterator always yields a value
      const { value: oldest } = this.#cache
        .keys()
        .next() as IteratorYieldResult<string>;

      this.#cache.delete(oldest);
    }

    this.#cache.set(key, value);
  }
}
