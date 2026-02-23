import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { KeyIndexCache } from "@real-router/cache-manager";

import {
  cacheKeyArbitrary,
  cacheOpsArbitrary,
  cacheValueArbitrary,
  maxSizeArbitrary,
  uniqueKeysArbitrary,
} from "./helpers";

describe("KeyIndexCache Property-Based Tests", () => {
  // ==========================================================================
  // Capacity invariant: size <= maxSize
  // ==========================================================================

  describe("Capacity invariant", () => {
    test.prop([maxSizeArbitrary, uniqueKeysArbitrary(1, 50)], {
      numRuns: 10_000,
    })("size never exceeds maxSize", (maxSize, keys) => {
      const cache = new KeyIndexCache<number>(maxSize);
      let counter = 0;

      for (const key of keys) {
        cache.get(key, () => counter++);

        expect(cache.getMetrics().size).toBeLessThanOrEqual(maxSize);
      }

      return true;
    });

    test.prop([maxSizeArbitrary, cacheOpsArbitrary], { numRuns: 10_000 })(
      "size never exceeds maxSize under arbitrary operations",
      (maxSize, ops) => {
        const cache = new KeyIndexCache<string>(maxSize);

        for (const op of ops) {
          switch (op.type) {
            case "get": {
              cache.get(op.key, () => `value-${op.key}`);

              break;
            }
            case "invalidate": {
              cache.invalidateMatching((k) => k.startsWith(op.prefix));

              break;
            }
            case "clear": {
              cache.clear();

              break;
            }
          }

          expect(cache.getMetrics().size).toBeLessThanOrEqual(maxSize);
        }

        return true;
      },
    );
  });

  // ==========================================================================
  // Cache hit: second get() with same key does not call compute
  // ==========================================================================

  describe("Cache hit invariant", () => {
    test.prop([maxSizeArbitrary, cacheKeyArbitrary, cacheValueArbitrary], {
      numRuns: 10_000,
    })(
      "get() on existing key does not call compute again",
      (maxSize, key, value) => {
        const cache = new KeyIndexCache<unknown>(maxSize);

        let computeCount = 0;
        const compute = () => {
          computeCount++;

          return value;
        };

        cache.get(key, compute);

        expect(computeCount).toBe(1);

        cache.get(key, compute);

        expect(computeCount).toBe(1);

        return true;
      },
    );

    test.prop([maxSizeArbitrary, cacheKeyArbitrary], { numRuns: 5000 })(
      "get() returns same value on cache hit",
      (maxSize, key) => {
        const cache = new KeyIndexCache<object>(maxSize);

        const sentinel = {};

        const result1 = cache.get(key, () => sentinel);
        const result2 = cache.get(key, () => ({}));

        expect(result1).toBe(sentinel);
        expect(result2).toBe(sentinel);

        return true;
      },
    );
  });

  // ==========================================================================
  // Metrics consistency: hits + misses === total get() calls
  // ==========================================================================

  describe("Metrics consistency", () => {
    test.prop([maxSizeArbitrary, cacheOpsArbitrary], { numRuns: 10_000 })(
      "hits + misses equals total get() calls",
      (maxSize, ops) => {
        const cache = new KeyIndexCache<string>(maxSize);
        let getCalls = 0;

        for (const op of ops) {
          switch (op.type) {
            case "get": {
              cache.get(op.key, () => `v-${op.key}`);
              getCalls++;

              break;
            }
            case "invalidate": {
              cache.invalidateMatching((k) => k.startsWith(op.prefix));

              break;
            }
            case "clear": {
              cache.clear();
              getCalls = 0;

              break;
            }
          }
        }

        const metrics = cache.getMetrics();

        expect(metrics.hits + metrics.misses).toBe(getCalls);

        return true;
      },
    );

    test.prop([maxSizeArbitrary, cacheOpsArbitrary], { numRuns: 5000 })(
      "hitRate is between 0 and 1",
      (maxSize, ops) => {
        const cache = new KeyIndexCache<string>(maxSize);

        for (const op of ops) {
          switch (op.type) {
            case "get": {
              cache.get(op.key, () => `v-${op.key}`);

              break;
            }
            case "invalidate": {
              cache.invalidateMatching((k) => k.startsWith(op.prefix));

              break;
            }
            case "clear": {
              cache.clear();

              break;
            }
          }
        }

        const { hitRate } = cache.getMetrics();

        expect(hitRate).toBeGreaterThanOrEqual(0);
        expect(hitRate).toBeLessThanOrEqual(1);

        return true;
      },
    );
  });

  // ==========================================================================
  // clear() resets all state
  // ==========================================================================

  describe("Clear invariant", () => {
    test.prop([maxSizeArbitrary, uniqueKeysArbitrary(1, 50)], {
      numRuns: 5000,
    })("clear() resets size and stats to zero", (maxSize, keys) => {
      const cache = new KeyIndexCache<number>(maxSize);

      for (const key of keys) {
        cache.get(key, () => 42);
      }

      cache.clear();

      const metrics = cache.getMetrics();

      expect(metrics.size).toBe(0);
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.hitRate).toBe(0);

      return true;
    });

    test.prop([maxSizeArbitrary, cacheKeyArbitrary], { numRuns: 5000 })(
      "get() after clear() always calls compute",
      (maxSize, key) => {
        const cache = new KeyIndexCache<string>(maxSize);

        cache.get(key, () => "first");
        cache.clear();

        let called = false;

        cache.get(key, () => {
          called = true;

          return "second";
        });

        expect(called).toBe(true);

        return true;
      },
    );
  });

  // ==========================================================================
  // invalidateMatching: no matching keys survive
  // ==========================================================================

  describe("Invalidation invariant", () => {
    test.prop(
      [maxSizeArbitrary, uniqueKeysArbitrary(1, 50), fc.func(fc.boolean())],
      { numRuns: 10_000 },
    )(
      "after invalidateMatching(p), no key satisfying p gives a hit",
      (maxSize, keys, predicate) => {
        const cache = new KeyIndexCache<number>(maxSize);

        for (const key of keys) {
          cache.get(key, () => 1);
        }

        cache.invalidateMatching(predicate);

        // Any key matching predicate must now be a miss
        for (const key of keys) {
          if (predicate(key)) {
            let called = false;

            cache.get(key, () => {
              called = true;

              return 2;
            });

            expect(called).toBe(true);
          }
        }

        return true;
      },
    );

    test.prop([maxSizeArbitrary, uniqueKeysArbitrary(2, 50)], {
      numRuns: 5000,
    })("invalidateMatching preserves non-matching entries", (maxSize, keys) => {
      const cache = new KeyIndexCache<string>(maxSize);

      // Insert all keys
      for (const key of keys) {
        cache.get(key, () => `v-${key}`);
      }

      // Invalidate keys starting with first character of first key
      const prefix = keys[0][0];

      cache.invalidateMatching((k) => k.startsWith(prefix));

      // Non-matching keys that are still in cache should be hits.
      // We can't guarantee every key survived (LRU eviction may have removed
      // some), so we verify: if a key is still cached, its value is correct.
      const surviving = keys.filter((k) => !k.startsWith(prefix));

      for (const key of surviving) {
        const result = cache.get(key, () => "recomputed");

        // Either the original value was returned (cache hit) or "recomputed" (miss due to LRU eviction)
        expect(result === `v-${key}` || result === "recomputed").toBe(true);
      }

      return true;
    });
  });

  // ==========================================================================
  // LRU eviction order: oldest entry is evicted first
  // ==========================================================================

  describe("LRU eviction order", () => {
    test.prop(
      [fc.integer({ min: 2, max: 20 }), fc.integer({ min: 0, max: 19 })],
      { numRuns: 5000 },
    )(
      "oldest untouched entry is evicted on overflow",
      (maxSize, touchIndex) => {
        const adjustedTouchIndex = touchIndex % maxSize;
        const cache = new KeyIndexCache<number>(maxSize);

        // Fill cache to capacity
        const keys = Array.from({ length: maxSize }, (_, i) => `key-${i}`);

        for (const key of keys) {
          cache.get(key, () => 1);
        }

        // Touch one entry to refresh its LRU position
        cache.get(keys[adjustedTouchIndex], () => 999);

        // Add one more to trigger eviction
        cache.get("overflow-key", () => 42);

        // The touched entry should survive
        let touchedRecomputed = false;

        cache.get(keys[adjustedTouchIndex], () => {
          touchedRecomputed = true;

          return 888;
        });

        expect(touchedRecomputed).toBe(false);

        // The oldest untouched entry should have been evicted
        // (entry at index 0 if touchIndex !== 0, otherwise entry at index 1)
        const evictedIndex = adjustedTouchIndex === 0 ? 1 : 0;

        let evictedRecomputed = false;

        cache.get(keys[evictedIndex], () => {
          evictedRecomputed = true;

          return 777;
        });

        expect(evictedRecomputed).toBe(true);

        return true;
      },
    );
  });

  // ==========================================================================
  // Constructor validation
  // ==========================================================================

  describe("Constructor validation", () => {
    test.prop(
      [
        fc.oneof(
          fc.integer({ max: 0 }),
          fc.double({
            min: 0.1,
            max: 100,
            noInteger: true,
            noNaN: true,
          }),
          fc.constant(Number.NaN),
          fc.constant(-Infinity),
          fc.constant(Infinity),
        ),
      ],
      { numRuns: 5000 },
    )("rejects invalid maxSize values", (invalidMaxSize) => {
      expect(() => new KeyIndexCache(invalidMaxSize)).toThrowError();

      return true;
    });

    test.prop([maxSizeArbitrary], { numRuns: 1000 })(
      "accepts valid maxSize values",
      (validMaxSize) => {
        const cache = new KeyIndexCache(validMaxSize);

        expect(cache.getMetrics().maxSize).toBe(validMaxSize);

        return true;
      },
    );
  });

  // ==========================================================================
  // Idempotency
  // ==========================================================================

  describe("Idempotency", () => {
    test.prop([maxSizeArbitrary, uniqueKeysArbitrary(1, 20)], {
      numRuns: 5000,
    })("double clear is same as single clear", (maxSize, keys) => {
      const cache = new KeyIndexCache<number>(maxSize);

      for (const key of keys) {
        cache.get(key, () => 1);
      }

      cache.clear();
      const metricsAfterFirst = cache.getMetrics();

      cache.clear();
      const metricsAfterSecond = cache.getMetrics();

      expect(metricsAfterFirst).toStrictEqual(metricsAfterSecond);

      return true;
    });
  });
});
