import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "@real-router/core";

let router: Router<TestDependencies>;

describe("core/dependencies/removeDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove existing dependency", () => {
    router.removeDependency("foo");

    expect(router.hasDependency("foo")).toBe(false);
    expect(() => {
      router.getDependency("foo");
    }).toThrowError(ReferenceError);
  });

  it("should return router instance for chaining", () => {
    const result = router.removeDependency("foo");

    expect(result).toBe(router);
  });

  it("should warn when removing non-existent dependency", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    router.removeDependency("nonexistent" as "foo");

    // Logger format: logger.warn(context, message)
    expect(warnSpy).toHaveBeenCalledWith(
      "router.removeDependency",
      expect.stringContaining(
        'Attempted to remove non-existent dependency: "string"',
      ),
    );

    warnSpy.mockRestore();
  });

  it("should handle multiple removals", () => {
    router.setDependency("bar", "value");
    router.removeDependency("foo");
    router.removeDependency("bar");

    const deps = router.getDependencies();

    expect(deps).toStrictEqual({});
  });

  it("should be idempotent - safe to call multiple times", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // First removal - should succeed
    router.removeDependency("foo");

    expect(router.hasDependency("foo")).toBe(false);

    // Second removal - should warn but not throw
    router.removeDependency("foo");

    // Logger format: logger.warn(context, message)
    expect(warnSpy).toHaveBeenCalledWith(
      "router.removeDependency",
      expect.stringContaining("Attempted to remove non-existent dependency"),
    );

    // Third removal - still safe
    router.removeDependency("foo");

    // Should have warned twice (second and third calls)
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("should throw TypeError for non-string parameters", () => {
    // Number parameter should throw
    expect(() => {
      // @ts-expect-error: testing number parameter
      router.removeDependency(123);
    }).toThrowError(TypeError);

    // null parameter should throw
    expect(() => {
      // @ts-expect-error: testing null parameter
      router.removeDependency(null);
    }).toThrowError(TypeError);

    // undefined parameter should throw
    expect(() => {
      // @ts-expect-error: testing undefined parameter
      router.removeDependency(undefined);
    }).toThrowError(TypeError);
  });

  it("should handle empty string as valid key", () => {
    // @ts-expect-error: testing empty string key
    router.setDependency("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(router.hasDependency("")).toBe(true);

    // @ts-expect-error: testing empty string key
    router.removeDependency("");

    // @ts-expect-error: testing empty string key
    expect(router.hasDependency("")).toBe(false);
  });

  it("should integrate correctly with getDependencies", () => {
    router.setDependencies({ foo: 1, bar: "test" });

    const depsBefore = router.getDependencies();

    expect(depsBefore).toStrictEqual({ foo: 1, bar: "test" });

    router.removeDependency("foo");

    const depsAfter = router.getDependencies();

    expect(depsAfter).toStrictEqual({ bar: "test" });
    expect(depsAfter).not.toHaveProperty("foo");
  });

  it("should support fluent chaining with other methods", () => {
    const result = router
      // @ts-expect-error: testing with temporary keys not in type
      .setDependency("temp1", "value1")
      // @ts-expect-error: testing with temporary keys not in type
      .setDependency("temp2", "value2")
      // @ts-expect-error: testing with temporary keys not in type
      .removeDependency("temp1")
      // @ts-expect-error: testing with temporary keys not in type
      .setDependency("temp3", "value3")
      // @ts-expect-error: testing with temporary keys not in type
      .removeDependency("temp2");

    expect(result).toBe(router);
    // @ts-expect-error: testing with temporary keys not in type
    expect(router.hasDependency("temp1")).toBe(false);
    // @ts-expect-error: testing with temporary keys not in type
    expect(router.hasDependency("temp2")).toBe(false);
    // @ts-expect-error: testing with temporary keys not in type
    expect(router.hasDependency("temp3")).toBe(true);
  });

  it("should allow safe cleanup without existence checks", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // Cleanup pattern - no need to check if dependencies exist
    const cleanupDeps = ["dep1", "dep2", "dep3"] as const;

    router.setDependency("dep1" as "foo", 1 as number);
    // dep2 and dep3 don't exist, but removal should be safe

    // Should not throw, even if some don't exist
    expect(() => {
      cleanupDeps.forEach((dep) => router.removeDependency(dep as "foo"));
    }).not.toThrowError();

    // Should have warned for non-existent dependencies
    expect(warnSpy).toHaveBeenCalledTimes(2); // dep2 and dep3

    warnSpy.mockRestore();
  });
});
