import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import { createDependenciesTestRouter } from "./setup";

import type { TestDependencies } from "./setup";
import type { Router, DependenciesApi } from "@real-router/core";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/resetDependencies", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove all dependencies", () => {
    deps.setAll({ foo: 5, bar: "test" });
    deps.reset();

    const depsObj = deps.getAll();

    expect(depsObj).toStrictEqual({});
  });

  it("should allow setting dependencies after reset", () => {
    deps.reset();
    deps.set("foo", 42);

    expect(deps.get("foo")).toBe(42);
  });

  it("should make hasDependency return false for all previous dependencies", () => {
    deps.setAll({ foo: 1, bar: "value" });
    deps.reset();

    expect(deps.has("foo")).toBe(false);
    expect(deps.has("bar")).toBe(false);
  });

  it("should be idempotent - safe to call multiple times", () => {
    deps.setAll({ foo: 1, bar: "test" });

    // First reset
    deps.reset();

    expect(deps.getAll()).toStrictEqual({});

    // Second reset - should not throw
    expect(() => {
      deps.reset();
    }).not.toThrowError();
    expect(deps.getAll()).toStrictEqual({});

    // Third reset - still safe
    expect(() => {
      deps.reset();
    }).not.toThrowError();
    expect(deps.getAll()).toStrictEqual({});
  });

  it("should work safely on empty container", () => {
    deps.reset(); // Already empty from beforeEach

    // Should not throw even if container is already empty
    expect(() => {
      deps.reset();
    }).not.toThrowError();

    expect(deps.getAll()).toStrictEqual({});
  });

  it("should cause getDependency to throw after reset", () => {
    deps.setAll({ foo: 1, bar: "test" });

    deps.reset();

    // All previous dependencies should throw when accessed
    expect(() => {
      deps.get("foo");
    }).toThrowError(ReferenceError);

    expect(() => {
      deps.get("bar");
    }).toThrowError(ReferenceError);
  });

  it("should handle special keys correctly", () => {
    // @ts-expect-error: testing special keys
    deps.set("", "empty");
    // @ts-expect-error: testing special keys
    deps.set("api:v2", "colon");
    // @ts-expect-error: testing special keys
    deps.set("用户", "unicode");

    deps.reset();

    // @ts-expect-error: testing special keys
    expect(deps.has("")).toBe(false);
    // @ts-expect-error: testing special keys
    expect(deps.has("api:v2")).toBe(false);
    // @ts-expect-error: testing special keys
    expect(deps.has("用户")).toBe(false);
  });

  it("should support full reinitialization pattern", () => {
    // Initial setup
    deps.setAll({ foo: 1, bar: "old" });

    // Full reinitialization
    deps.reset();
    // @ts-expect-error: testing new keys after reset
    deps.set("baz", "new1");
    // @ts-expect-error: testing new keys after reset
    deps.set("qux", "new2");

    // Old dependencies should be gone
    expect(deps.has("foo")).toBe(false);
    expect(deps.has("bar")).toBe(false);

    // New dependencies should exist
    expect(deps.get("baz" as "foo")).toBe("new1");
    expect(deps.get("qux" as "foo")).toBe("new2");
  });

  it("should remove falsy values as well", () => {
    deps.set("foo", 0 as number);
    // @ts-expect-error: testing null value
    deps.set("bar", null);
    deps.set("baz", false);

    deps.reset();

    expect(deps.has("foo")).toBe(false);
    expect(deps.has("bar")).toBe(false);
    expect(deps.has("baz")).toBe(false);
  });

  it("should integrate correctly in test isolation pattern", () => {
    // Simulate test 1
    // @ts-expect-error: testing new keys
    deps.set("testDep1", "value1");

    expect(deps.has("testDep1" as "foo")).toBe(true);

    // Cleanup between tests
    deps.reset();

    // Simulate test 2 - should not see test 1 dependencies
    expect(deps.has("testDep1" as "foo")).toBe(false);

    // @ts-expect-error: testing new keys
    deps.set("testDep2", "value2");

    expect(deps.has("testDep2" as "foo")).toBe(true);

    // Cleanup
    deps.reset();

    expect(deps.has("testDep2" as "foo")).toBe(false);
  });
});
