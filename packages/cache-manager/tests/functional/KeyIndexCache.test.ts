import { describe, it, expect, vi } from "vitest";

import { KeyIndexCache } from "../../src/KeyIndexCache.js";

import type { CacheInstance } from "../../src/types.js";

describe("KeyIndexCache", () => {
  describe("constructor", () => {
    it("creates cache with valid maxSize", () => {
      const c = new KeyIndexCache<string>(10);

      expect(c.getMetrics().maxSize).toBe(10);
    });

    it("throws on maxSize = 0", () => {
      expect(() => new KeyIndexCache(0)).toThrowError();
    });

    it("throws on negative maxSize", () => {
      expect(() => new KeyIndexCache(-1)).toThrowError();
    });

    it("throws on non-integer maxSize", () => {
      expect(() => new KeyIndexCache(1.5)).toThrowError();
    });

    it("accepts maxSize = 1", () => {
      expect(() => new KeyIndexCache(1)).not.toThrowError();
    });
  });

  describe("get()", () => {
    it("calls compute on miss and returns result", () => {
      const cache = new KeyIndexCache<string>(10);
      const compute = vi.fn(() => "value");

      expect(cache.get("key", compute)).toBe("value");
      expect(compute).toHaveBeenCalledTimes(1);
    });

    it("returns cached value on hit without calling compute", () => {
      const cache = new KeyIndexCache<string>(10);
      const compute = vi.fn(() => "value");

      cache.get("key", compute);
      const result = cache.get("key", compute);

      expect(result).toBe("value");
      expect(compute).toHaveBeenCalledTimes(1); // only once total
    });

    it("tracks hits and misses", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1); // miss
      cache.get("a", () => 2); // hit
      cache.get("b", () => 3); // miss
      const m = cache.getMetrics();

      expect(m.hits).toBe(1);
      expect(m.misses).toBe(2);
    });

    it("handles empty string key", () => {
      const cache = new KeyIndexCache<string>(10);
      const result = cache.get("", () => "empty");

      expect(result).toBe("empty");
    });

    it("handles different keys independently", () => {
      const cache = new KeyIndexCache<number>(10);

      expect(cache.get("x", () => 1)).toBe(1);
      expect(cache.get("y", () => 2)).toBe(2);
      expect(cache.get("x", () => 99)).toBe(1); // cached
      expect(cache.get("y", () => 99)).toBe(2); // cached
    });
  });

  describe("LRU eviction", () => {
    it("evicts LRU entry when full (not recently used)", () => {
      const cache = new KeyIndexCache<string>(2);

      cache.get("A", () => "a"); // insert A
      cache.get("B", () => "b"); // insert B
      cache.get("A", () => "a"); // refresh A (A is now newest, B is LRU)
      cache.get("C", () => "c"); // insert C → B evicted

      // A should still be cached (verify before fetching B, which would evict A)
      const computeA = vi.fn(() => "a2");

      cache.get("A", computeA);

      expect(computeA).not.toHaveBeenCalled(); // A still in cache

      // B should be evicted
      const computeB = vi.fn(() => "b2");

      cache.get("B", computeB);

      expect(computeB).toHaveBeenCalledTimes(1); // B was evicted → miss
    });

    it("maxSize=1: each new entry evicts previous", () => {
      const cache = new KeyIndexCache<number>(1);

      cache.get("A", () => 1);
      cache.get("B", () => 2); // A evicted

      expect(cache.getMetrics().size).toBe(1);

      const computeA = vi.fn(() => 99);

      cache.get("A", computeA);

      expect(computeA).toHaveBeenCalledTimes(1); // A was evicted
    });

    it("size stays at maxSize after eviction", () => {
      const cache = new KeyIndexCache<number>(3);

      cache.get("a", () => 1);
      cache.get("b", () => 2);
      cache.get("c", () => 3);
      cache.get("d", () => 4); // evicts oldest

      expect(cache.getMetrics().size).toBe(3);
    });

    it("evicted entry treated as miss on next access", () => {
      const cache = new KeyIndexCache<number>(1);

      cache.get("A", () => 1); // A in cache
      cache.get("B", () => 2); // B in cache, A evicted
      const compute = vi.fn(() => 99);

      cache.get("A", compute); // A is miss

      expect(compute).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalidateMatching()", () => {
    it("removes entries matching predicate", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("users.profile", () => "profile");
      cache.get("users.settings", () => "settings");
      cache.get("home", () => "home");

      cache.invalidateMatching((key: string) => key.startsWith("users"));

      expect(cache.getMetrics().size).toBe(1); // only "home" remains
    });

    it("non-matching entries survive", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("a", () => "a");
      cache.get("b", () => "b");
      cache.invalidateMatching((key) => key === "a");

      const computeB = vi.fn(() => "b2");

      cache.get("b", computeB);

      expect(computeB).not.toHaveBeenCalled(); // b still cached
    });

    it("predicate always false: nothing removed", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("a", () => "a");
      cache.invalidateMatching(() => false);

      expect(cache.getMetrics().size).toBe(1);
    });

    it("predicate always true: all entries removed", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("a", () => "a");
      cache.get("b", () => "b");
      cache.invalidateMatching(() => true);

      expect(cache.getMetrics().size).toBe(0);
    });

    it("does NOT reset metrics", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1); // miss
      cache.get("a", () => 2); // hit
      cache.invalidateMatching(() => true);
      const m = cache.getMetrics();

      expect(m.hits).toBe(1);
      expect(m.misses).toBe(1);
    });

    it("invalidated entry treated as miss on next access", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1); // populate
      cache.invalidateMatching((key) => key === "a");
      const compute = vi.fn(() => 99);

      cache.get("a", compute);

      expect(compute).toHaveBeenCalledTimes(1);
    });

    it("works on empty cache (no-op)", () => {
      const cache = new KeyIndexCache<string>(10);

      expect(() => {
        cache.invalidateMatching(() => true);
      }).not.toThrowError();
      expect(cache.getMetrics().size).toBe(0);
    });
  });

  describe("getMetrics()", () => {
    it("initial state all zeros, hitRate = 0", () => {
      const cache = new KeyIndexCache<number>(5);

      expect(cache.getMetrics()).toStrictEqual({
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        maxSize: 5,
      });
    });

    it("hitRate = 0 when only misses", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1);

      expect(cache.getMetrics().hitRate).toBe(0);
    });

    it("hitRate = hits / total when mix of hits and misses", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1); // miss
      cache.get("a", () => 1); // hit
      cache.get("a", () => 1); // hit

      expect(cache.getMetrics().hitRate).toBeCloseTo(2 / 3);
    });

    it("size reflects current cache entries", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1);
      cache.get("b", () => 2);

      expect(cache.getMetrics().size).toBe(2);
    });

    it("maxSize matches constructor arg", () => {
      expect(new KeyIndexCache<number>(42).getMetrics().maxSize).toBe(42);
    });
  });

  describe("clear()", () => {
    it("removes all entries (size → 0)", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("a", () => "a");
      cache.get("b", () => "b");
      cache.clear();

      expect(cache.getMetrics().size).toBe(0);
    });

    it("resets metrics", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("a", () => "a"); // miss
      cache.get("a", () => "a"); // hit
      cache.clear();
      const m = cache.getMetrics();

      expect(m.hits).toBe(0);
      expect(m.misses).toBe(0);
      expect(m.hitRate).toBe(0);
      expect(m.size).toBe(0);
    });

    it("after clear + get: treats as miss (calls compute)", () => {
      const cache = new KeyIndexCache<number>(10);

      cache.get("a", () => 1);
      cache.clear();
      const compute = vi.fn(() => 99);

      cache.get("a", compute);

      expect(compute).toHaveBeenCalledTimes(1);
    });

    it("is idempotent (calling twice is safe)", () => {
      const cache = new KeyIndexCache<string>(10);

      cache.get("a", () => "a");

      expect(() => {
        cache.clear();
        cache.clear();
      }).not.toThrowError();
      expect(cache.getMetrics().size).toBe(0);
    });
  });

  describe("CacheInstance<T> compatibility", () => {
    it("is structurally compatible with CacheInstance<T>", () => {
      // TypeScript structural typing check — this test just needs to compile
      const c: CacheInstance<number> = new KeyIndexCache<number>(5);

      expect(c.get("key", () => 42)).toBe(42);

      c.invalidateMatching(() => false);
      c.getMetrics();
      c.clear();
    });
  });
});
