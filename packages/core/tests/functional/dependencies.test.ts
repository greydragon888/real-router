import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";

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
    // Router now has built-in dependency management via DependenciesNamespace
    router = createRouter<{ foo?: number; bar?: string }>([], {}, { foo: 1 });
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
});
