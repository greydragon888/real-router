import { describe, it, expect, vi, beforeEach } from "vitest";

import { cacheManager, CacheManager } from "../../src/CacheManager.js";

describe("CacheManager", () => {
  beforeEach(() => {
    cacheManager.dispose();
  });

  describe("register()", () => {
    it("returns a usable KeyIndexCache", () => {
      const cache = cacheManager.register("test", { maxSize: 10 });
      const result = cache.get("key", () => "value");

      expect(result).toBe("value");
    });

    it("stores cache in registry", () => {
      cacheManager.register("myCache", { maxSize: 5 });

      expect(cacheManager.getCacheNames()).toContain("myCache");
    });

    it("throws on duplicate registration", () => {
      cacheManager.register("dup", { maxSize: 10 });

      expect(() => cacheManager.register("dup", { maxSize: 5 })).toThrowError(
        /dup/,
      );
    });

    it("error message contains cache name", () => {
      cacheManager.register("uniqueName", { maxSize: 1 });

      expect(() =>
        cacheManager.register("uniqueName", { maxSize: 1 }),
      ).toThrowError("uniqueName");
    });

    it("registers with onInvalidate callback", () => {
      const onInvalidate = vi.fn();

      cacheManager.register("withCallback", { maxSize: 10, onInvalidate });

      expect(cacheManager.getCacheNames()).toContain("withCallback");
    });

    it("multiple caches registered independently", () => {
      cacheManager.register("a", { maxSize: 10 });
      cacheManager.register("b", { maxSize: 20 });

      expect(cacheManager.getCacheNames()).toHaveLength(2);
    });
  });

  describe("unregister()", () => {
    it("removes cache from registry", () => {
      cacheManager.register("toRemove", { maxSize: 10 });
      cacheManager.unregister("toRemove");

      expect(cacheManager.getCacheNames()).not.toContain("toRemove");
    });

    it("clears cache entries on unregister", () => {
      const cache = cacheManager.register("toRemove", { maxSize: 10 });

      cache.get("key", () => "value");
      cacheManager.unregister("toRemove");
      // After unregister + re-register, fresh cache
      const fresh = cacheManager.register("toRemove", { maxSize: 10 });

      expect(fresh.getMetrics().size).toBe(0);
    });

    it("is a no-op for unknown cache name", () => {
      expect(() => {
        cacheManager.unregister("doesNotExist");
      }).not.toThrowError();
    });

    it("allows re-registration after unregister", () => {
      cacheManager.register("cycle", { maxSize: 10 });
      cacheManager.unregister("cycle");

      expect(() =>
        cacheManager.register("cycle", { maxSize: 5 }),
      ).not.toThrowError();
    });
  });

  describe("invalidateForNewRoutes()", () => {
    it("calls onInvalidate for caches with callback", () => {
      const onInvalidate = vi.fn();

      cacheManager.register("a", { maxSize: 10, onInvalidate });
      cacheManager.invalidateForNewRoutes(["newRoute"]);

      expect(onInvalidate).toHaveBeenCalledWith(expect.anything(), [
        "newRoute",
      ]);
    });

    it("calls cache.clear() for caches WITHOUT onInvalidate", () => {
      const cache = cacheManager.register("b", { maxSize: 10 });

      cache.get("key", () => "val");

      expect(cache.getMetrics().size).toBe(1);

      cacheManager.invalidateForNewRoutes(["newRoute"]);

      expect(cache.getMetrics().size).toBe(0); // cleared
    });

    it("passes correct newRouteNames to onInvalidate", () => {
      const onInvalidate = vi.fn();

      cacheManager.register("routes", { maxSize: 10, onInvalidate });
      cacheManager.invalidateForNewRoutes(["users", "admin"]);

      expect(onInvalidate).toHaveBeenCalledWith(expect.anything(), [
        "users",
        "admin",
      ]);
    });

    it("handles empty registry (no-op)", () => {
      expect(() => {
        cacheManager.invalidateForNewRoutes(["any"]);
      }).not.toThrowError();
    });

    it("handles empty newRouteNames array", () => {
      const onInvalidate = vi.fn();

      cacheManager.register("c", { maxSize: 10, onInvalidate });

      expect(() => {
        cacheManager.invalidateForNewRoutes([]);
      }).not.toThrowError();
      expect(onInvalidate).toHaveBeenCalledWith(expect.anything(), []);
    });

    it("handles mixed caches (some with, some without onInvalidate)", () => {
      const onInvalidate = vi.fn();

      cacheManager.register("A", { maxSize: 10, onInvalidate });
      const cacheB = cacheManager.register("B", { maxSize: 10 }); // no callback

      cacheB.get("x", () => 1);

      cacheManager.invalidateForNewRoutes(["new"]);

      expect(onInvalidate).toHaveBeenCalledTimes(1); // A: callback
      expect(cacheB.getMetrics().size).toBe(0); // B: cleared
    });
  });

  describe("clear()", () => {
    it("clears all cache contents", () => {
      const c1 = cacheManager.register("c1", { maxSize: 10 });
      const c2 = cacheManager.register("c2", { maxSize: 10 });

      c1.get("k", () => 1);
      c2.get("k", () => 2);
      cacheManager.clear();

      expect(c1.getMetrics().size).toBe(0);
      expect(c2.getMetrics().size).toBe(0);
    });

    it("keeps registry intact after clear", () => {
      cacheManager.register("keep", { maxSize: 10 });
      cacheManager.clear();

      expect(cacheManager.getCacheNames()).toContain("keep");
    });

    it("caches are still usable after clear", () => {
      const cache = cacheManager.register("usable", { maxSize: 10 });

      cacheManager.clear();

      expect(() => cache.get("k", () => "v")).not.toThrowError();
    });
  });

  describe("dispose()", () => {
    it("clears all cache entries", () => {
      const cache = cacheManager.register("d", { maxSize: 10 });

      cache.get("k", () => "v");
      cacheManager.dispose();

      expect(cache.getMetrics().size).toBe(0);
    });

    it("empties the registry", () => {
      cacheManager.register("d1", { maxSize: 10 });
      cacheManager.register("d2", { maxSize: 10 });
      cacheManager.dispose();

      expect(cacheManager.getCacheNames()).toHaveLength(0);
    });

    it("is idempotent (calling twice is safe)", () => {
      cacheManager.register("idem", { maxSize: 10 });

      expect(() => {
        cacheManager.dispose();
        cacheManager.dispose();
      }).not.toThrowError();
    });

    it("allows register() after dispose()", () => {
      cacheManager.dispose();

      expect(() =>
        cacheManager.register("after", { maxSize: 10 }),
      ).not.toThrowError();
    });
  });

  describe("getMetrics()", () => {
    it("returns empty object for empty registry", () => {
      expect(cacheManager.getMetrics()).toStrictEqual({});
    });

    it("returns metrics for all caches", () => {
      const a = cacheManager.register("alpha", { maxSize: 10 });
      const b = cacheManager.register("beta", { maxSize: 20 });

      a.get("k", () => 1); // miss
      a.get("k", () => 1); // hit
      b.get("x", () => 2); // miss

      const metrics = cacheManager.getMetrics();

      expect(metrics.alpha.hits).toBe(1);
      expect(metrics.alpha.misses).toBe(1);
      expect(metrics.beta.misses).toBe(1);
    });

    it("keys match registered cache names", () => {
      cacheManager.register("first", { maxSize: 5 });
      cacheManager.register("second", { maxSize: 5 });
      const keys = Object.keys(cacheManager.getMetrics());

      expect(keys).toContain("first");
      expect(keys).toContain("second");
    });
  });

  describe("getCacheNames()", () => {
    it("returns empty array for empty registry", () => {
      expect(cacheManager.getCacheNames()).toStrictEqual([]);
    });

    it("returns names of all registered caches", () => {
      cacheManager.register("x", { maxSize: 5 });
      cacheManager.register("y", { maxSize: 5 });

      expect(cacheManager.getCacheNames()).toContain("x");
      expect(cacheManager.getCacheNames()).toContain("y");
    });

    it("matches registration order", () => {
      cacheManager.register("first", { maxSize: 5 });
      cacheManager.register("second", { maxSize: 5 });
      cacheManager.register("third", { maxSize: 5 });

      expect(cacheManager.getCacheNames()).toStrictEqual([
        "first",
        "second",
        "third",
      ]);
    });
  });

  describe("singleton isolation", () => {
    it("same instance across imports", async () => {
      // Verify that the singleton is shared (same object)
      const { cacheManager: cm2 } = await import("../../src/CacheManager.js");

      expect(cm2).toBe(cacheManager);
    });

    it("beforeEach dispose() resets state between tests", () => {
      cacheManager.register("check", { maxSize: 5 });

      // After this test, beforeEach will dispose() before next test
      // This just verifies registration works
      expect(cacheManager.getCacheNames()).toContain("check");
    });
  });

  describe("new CacheManager()", () => {
    it("creates independent instance from singleton", () => {
      const independent = new CacheManager();

      independent.register("local", { maxSize: 5 });

      expect(cacheManager.getCacheNames()).not.toContain("local");
    });
  });
});
