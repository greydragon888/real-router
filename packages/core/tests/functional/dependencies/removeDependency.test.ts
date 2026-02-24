import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { DependenciesApi, Router } from "@real-router/core";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/removeDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove existing dependency", () => {
    deps.remove("foo");

    expect(deps.has("foo")).toBe(false);
    expect(() => {
      deps.get("foo");
    }).toThrowError(ReferenceError);
  });

  it("should warn when removing non-existent dependency", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.remove("nonexistent" as "foo");

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
    deps.set("bar", "value");
    deps.remove("foo");
    deps.remove("bar");

    const depsObj = deps.getAll();

    expect(depsObj).toStrictEqual({});
  });

  it("should be idempotent - safe to call multiple times", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // First removal - should succeed
    deps.remove("foo");

    expect(deps.has("foo")).toBe(false);

    // Second removal - should warn but not throw
    deps.remove("foo");

    // Logger format: logger.warn(context, message)
    expect(warnSpy).toHaveBeenCalledWith(
      "router.removeDependency",
      expect.stringContaining("Attempted to remove non-existent dependency"),
    );

    // Third removal - still safe
    deps.remove("foo");

    // Should have warned twice (second and third calls)
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("should throw TypeError for non-string parameters", () => {
    // Number parameter should throw
    expect(() => {
      // @ts-expect-error: testing number parameter
      deps.remove(123);
    }).toThrowError(TypeError);

    // null parameter should throw
    expect(() => {
      // @ts-expect-error: testing null parameter
      deps.remove(null);
    }).toThrowError(TypeError);

    // undefined parameter should throw
    expect(() => {
      // @ts-expect-error: testing undefined parameter
      deps.remove(undefined);
    }).toThrowError(TypeError);
  });

  it("should handle empty string as valid key", () => {
    // @ts-expect-error: testing empty string key
    deps.set("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(deps.has("")).toBe(true);

    // @ts-expect-error: testing empty string key
    deps.remove("");

    // @ts-expect-error: testing empty string key
    expect(deps.has("")).toBe(false);
  });

  it("should integrate correctly with getDependencies", () => {
    deps.setAll({ foo: 1, bar: "test" });

    const depsBefore = deps.getAll();

    expect(depsBefore).toStrictEqual({ foo: 1, bar: "test" });

    deps.remove("foo");

    const depsAfter = deps.getAll();

    expect(depsAfter).toStrictEqual({ bar: "test" });
    expect(depsAfter).not.toHaveProperty("foo");
  });

  it("should support fluent chaining with other methods", () => {
    // @ts-expect-error: testing with temporary keys not in type
    deps.set("temp1", "value1");
    // @ts-expect-error: testing with temporary keys not in type
    deps.set("temp2", "value2");
    // @ts-expect-error: testing with temporary keys not in type
    deps.remove("temp1");
    // @ts-expect-error: testing with temporary keys not in type
    deps.set("temp3", "value3");
    // @ts-expect-error: testing with temporary keys not in type
    deps.remove("temp2");

    // @ts-expect-error: testing with temporary keys not in type
    expect(deps.has("temp1")).toBe(false);
    // @ts-expect-error: testing with temporary keys not in type
    expect(deps.has("temp2")).toBe(false);
    // @ts-expect-error: testing with temporary keys not in type
    expect(deps.has("temp3")).toBe(true);
  });

  it("should allow safe cleanup without existence checks", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // Cleanup pattern - no need to check if dependencies exist
    const cleanupDeps = ["dep1", "dep2", "dep3"] as const;

    deps.set("dep1" as "foo", 1 as number);
    // dep2 and dep3 don't exist, but removal should be safe

    // Should not throw, even if some don't exist
    expect(() => {
      cleanupDeps.forEach((dep) => {
        deps.remove(dep as "foo");
      });
    }).not.toThrowError();

    // Should have warned for non-existent dependencies
    expect(warnSpy).toHaveBeenCalledTimes(2); // dep2 and dep3

    warnSpy.mockRestore();
  });
});
