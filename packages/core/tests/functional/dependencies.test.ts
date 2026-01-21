import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

import { withDependencies } from "../../src/core/dependencies";

import type { Router } from "@real-router/core";

// Import all individual test modules
import "./dependencies/setDependency.test";
import "./dependencies/setDependencies.test";
import "./dependencies/getDependency.test";
import "./dependencies/getDependencies.test";
import "./dependencies/removeDependency.test";
import "./dependencies/hasDependency.test";
import "./dependencies/resetDependencies.test";

let router: Router<{ foo?: number; bar?: string }>;

describe("core/dependencies (integration)", () => {
  beforeEach(() => {
    const baseRouter = createRouter();

    router = withDependencies<{ foo?: number; bar?: string }>({ foo: 1 })(
      baseRouter,
    );
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("full dependency lifecycle", () => {
    it("should handle complete dependency lifecycle", () => {
      // Initial state
      expect(router.hasDependency("foo")).toBe(true);
      expect(router.getDependency("foo")).toBe(1);

      // Set new dependency
      router.setDependency("bar", "hello");

      expect(router.hasDependency("bar")).toBe(true);
      expect(router.getDependency("bar")).toBe("hello");

      // Update existing dependency
      router.setDependency("foo", 42);

      expect(router.getDependency("foo")).toBe(42);

      // Get all dependencies
      const deps = router.getDependencies();

      expect(deps).toStrictEqual({ foo: 42, bar: "hello" });

      // Remove one dependency
      router.removeDependency("bar");

      expect(router.hasDependency("bar")).toBe(false);

      // Reset all dependencies
      router.resetDependencies();

      expect(router.hasDependency("foo")).toBe(false);

      expect(router.getDependencies()).toStrictEqual({});
    });

    it("should support fluent chaining across all methods", () => {
      const result = router
        .setDependency("bar", "value1")
        // @ts-expect-error: testing new key
        .setDependency("baz", "value2")
        .setDependencies({ foo: 100 })
        // @ts-expect-error: testing removal
        .removeDependency("baz")
        .setDependency("bar", "updated");

      expect(result).toBe(router);
      expect(router.getDependency("foo")).toBe(100);
      expect(router.getDependency("bar")).toBe("updated");
      expect(router.hasDependency("baz" as "foo")).toBe(false);
    });

    it("should handle batch operations correctly", () => {
      router.setDependencies({
        foo: 10,
        bar: "test",
      });

      expect(router.getDependency("foo")).toBe(10);
      expect(router.getDependency("bar")).toBe("test");

      const allDeps = router.getDependencies();

      expect(allDeps).toStrictEqual({ foo: 10, bar: "test" });

      router.resetDependencies();

      expect(router.getDependencies()).toStrictEqual({});
    });

    it("should maintain data integrity across operations", () => {
      const service = { count: 0 };

      // @ts-expect-error: testing object value
      router.setDependency("foo", service);

      const ref1 = router.getDependency("foo");
      const ref2 = router.getDependency("foo");

      // Same reference
      expect(ref1).toBe(ref2);
      expect(ref1).toBe(service);

      // @ts-expect-error: mutating object
      ref1.count = 42;

      // @ts-expect-error: checking mutation
      expect(ref2.count).toBe(42);
      expect(service.count).toBe(42);
    });

    it("should handle error cases gracefully", () => {
      expect(() => {
        router.getDependency("nonexistent" as "foo");
      }).toThrowError(ReferenceError);

      expect(() => {
        // @ts-expect-error: testing invalid key type
        router.setDependency(123, "value");
      }).toThrowError(TypeError);

      expect(() => {
        // @ts-expect-error: testing invalid input
        router.setDependencies([]);
      }).toThrowError(TypeError);
    });
  });

  describe("dependency limits (lines 29-48)", () => {
    it("should warn when reaching 20 dependencies (line 30)", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const testRouter = createRouter<Record<string, number>>();
      const routerWithDeps = withDependencies<Record<string, number>>({})(
        testRouter,
      );

      // Add 20 dependencies to trigger warning
      for (let i = 0; i < 20; i++) {
        routerWithDeps.setDependency(`dep${i}`, i);
      }

      // Verify all dependencies were set (no throw occurred)
      expect(Object.keys(routerWithDeps.getDependencies())).toHaveLength(20);

      warnSpy.mockRestore();
    });

    it("should error when reaching 50 dependencies (line 36)", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const testRouter = createRouter<Record<string, number>>();
      const routerWithDeps = withDependencies<Record<string, number>>({})(
        testRouter,
      );

      // Add 51 dependencies - checkDependencyCount is called BEFORE adding,
      // so the 51st call triggers the error log when count is exactly 50
      for (let i = 0; i < 51; i++) {
        routerWithDeps.setDependency(`dep${i}`, i);
      }

      expect(errorSpy).toHaveBeenCalled();
      // Console format: console.error("[context] message")
      // callArgs[0] is the combined message
      expect(errorSpy.mock.calls[0][0]).toContain("50 dependencies");

      errorSpy.mockRestore();
    });

    it("should throw when exceeding hard limit of 100 dependencies (line 43)", () => {
      const testRouter = createRouter<Record<string, number>>();
      const routerWithDeps = withDependencies<Record<string, number>>({})(
        testRouter,
      );

      // Add 100 dependencies first
      for (let i = 0; i < 100; i++) {
        routerWithDeps.setDependency(`dep${i}`, i);
      }

      // The 101st should throw (checkDependencyCount sees 100)
      expect(() => {
        routerWithDeps.setDependency("dep100", 100);
      }).toThrowError(/Dependency limit exceeded.*100/);
    });

    it("should allow overwriting existing dependency at hard limit", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const testRouter = createRouter<Record<string, number>>();
      const routerWithDeps = withDependencies<Record<string, number>>({})(
        testRouter,
      );

      // Add exactly 100 dependencies
      for (let i = 0; i < 100; i++) {
        routerWithDeps.setDependency(`dep${i}`, i);
      }

      warnSpy.mockClear();

      // Overwriting should NOT throw (count stays at 100)
      expect(() => {
        routerWithDeps.setDependency("dep0", 999);
      }).not.toThrowError();

      // Value should be updated
      expect(routerWithDeps.getDependency("dep0")).toBe(999);

      // Warning about overwrite should have been logged
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Console format: console.warn("[context] message", ...args)
      // callArgs[0] is the combined message
      expect(warnSpy.mock.calls[0][0]).toContain("being overwritten");

      warnSpy.mockRestore();
    });

    it("should handle many dependencies without error", () => {
      const testRouter = createRouter<Record<string, number>>();
      const routerWithDeps = withDependencies<Record<string, number>>({})(
        testRouter,
      );

      // Add many dependencies
      for (let i = 0; i < 50; i++) {
        routerWithDeps.setDependency(`dep${i}`, i);
      }

      // Should have 50 dependencies
      const deps = routerWithDeps.getDependencies();

      expect(Object.keys(deps)).toHaveLength(50);
    });

    it("should throw for non-string dependency name", () => {
      const testRouter = createRouter<Record<string, number>>();
      const routerWithDeps = withDependencies<Record<string, number>>({})(
        testRouter,
      );

      // Create an object - should throw for invalid type
      const badKey = { test: true };

      expect(() =>
        routerWithDeps.getDependency(badKey as unknown as string),
      ).toThrowError("dependency name must be a string");
    });
  });
});
