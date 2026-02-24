import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, getDependenciesApi } from "@real-router/core";

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
      const deps = getDependenciesApi(router);

      // Initial state
      expect(deps.has("foo")).toBe(true);
      expect(deps.get("foo")).toBe(1);

      // Set new dependency
      deps.set("bar", "hello");

      expect(deps.has("bar")).toBe(true);
      expect(deps.get("bar")).toBe("hello");

      // Update existing dependency
      deps.set("foo", 42);

      expect(deps.get("foo")).toBe(42);

      // Get all dependencies
      const allDeps = deps.getAll();

      expect(allDeps).toStrictEqual({ foo: 42, bar: "hello" });

      // Remove one dependency
      deps.remove("bar");

      expect(deps.has("bar")).toBe(false);

      // Reset all dependencies
      deps.reset();

      expect(deps.has("foo")).toBe(false);

      expect(deps.getAll()).toStrictEqual({});
    });

    it("should support fluent chaining across all methods", () => {
      const deps = getDependenciesApi(router);

      deps.set("bar", "value1");
      // @ts-expect-error: testing new key
      deps.set("baz", "value2");
      deps.setAll({ foo: 100 });
      // @ts-expect-error: testing removal
      deps.remove("baz");
      deps.set("bar", "updated");

      expect(deps.get("foo")).toBe(100);
      expect(deps.get("bar")).toBe("updated");
      // @ts-expect-error: testing removal
      expect(deps.has("baz")).toBe(false);
    });

    it("should handle batch operations correctly", () => {
      const deps = getDependenciesApi(router);

      deps.setAll({
        foo: 10,
        bar: "test",
      });

      expect(deps.get("foo")).toBe(10);
      expect(deps.get("bar")).toBe("test");

      const allDeps = deps.getAll();

      expect(allDeps).toStrictEqual({ foo: 10, bar: "test" });

      deps.reset();

      expect(deps.getAll()).toStrictEqual({});
    });

    it("should maintain data integrity across operations", () => {
      const deps = getDependenciesApi(router);
      const service = { count: 0 };

      // @ts-expect-error: testing object value
      deps.set("foo", service);

      const ref1 = deps.get("foo");
      const ref2 = deps.get("foo");

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
      const deps = getDependenciesApi(router);

      expect(() => {
        deps.get("nonexistent" as "foo");
      }).toThrowError(ReferenceError);

      expect(() => {
        deps.set(123 as any, "value");
      }).toThrowError(TypeError);

      expect(() => {
        deps.setAll([] as any);
      }).toThrowError(TypeError);
    });
  });
});
