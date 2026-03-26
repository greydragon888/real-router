import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createDependenciesTestRouter } from "./setup";
import { getDependenciesApi } from "../../../../src/api";

import type { TestDependencies } from "./setup";
import type { Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/types";

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
  });

  it("should NOT warn via logger when removing non-existent dependency (no validation plugin)", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.remove("nonexistent" as "foo");

    expect(warnSpy).not.toHaveBeenCalled();

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

    deps.remove("foo");

    expect(deps.has("foo")).toBe(false);

    deps.remove("foo");
    deps.remove("foo");

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
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

    const cleanupDeps = ["dep1", "dep2", "dep3"] as const;

    deps.set("dep1" as "foo", 1 as number);

    expect(() => {
      cleanupDeps.forEach((dep) => {
        deps.remove(dep as "foo");
      });
    }).not.toThrow();

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
