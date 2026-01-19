import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "router6";

let router: Router<TestDependencies>;

describe("core/dependencies/resetDependencies", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove all dependencies", () => {
    router.setDependencies({ foo: 5, bar: "test" });
    router.resetDependencies();

    const deps = router.getDependencies();

    expect(deps).toStrictEqual({});
  });

  it("should return router instance for chaining", () => {
    const result = router.resetDependencies();

    expect(result).toBe(router);
  });

  it("should allow setting dependencies after reset", () => {
    router.resetDependencies();
    router.setDependency("foo", 42);

    expect(router.getDependency("foo")).toBe(42);
  });

  it("should make hasDependency return false for all previous dependencies", () => {
    router.setDependencies({ foo: 1, bar: "value" });
    router.resetDependencies();

    expect(router.hasDependency("foo")).toBe(false);
    expect(router.hasDependency("bar")).toBe(false);
  });

  it("should be idempotent - safe to call multiple times", () => {
    router.setDependencies({ foo: 1, bar: "test" });

    // First reset
    router.resetDependencies();

    expect(router.getDependencies()).toStrictEqual({});

    // Second reset - should not throw
    expect(() => {
      router.resetDependencies();
    }).not.toThrowError();
    expect(router.getDependencies()).toStrictEqual({});

    // Third reset - still safe
    expect(() => {
      router.resetDependencies();
    }).not.toThrowError();
    expect(router.getDependencies()).toStrictEqual({});
  });

  it("should work safely on empty container", () => {
    router.resetDependencies(); // Already empty from beforeEach

    // Should not throw even if container is already empty
    expect(() => {
      router.resetDependencies();
    }).not.toThrowError();

    expect(router.getDependencies()).toStrictEqual({});
  });

  it("should cause getDependency to throw after reset", () => {
    router.setDependencies({ foo: 1, bar: "test" });

    router.resetDependencies();

    // All previous dependencies should throw when accessed
    expect(() => {
      router.getDependency("foo");
    }).toThrowError(ReferenceError);

    expect(() => {
      router.getDependency("bar");
    }).toThrowError(ReferenceError);
  });

  it("should handle special keys correctly", () => {
    // @ts-expect-error: testing special keys
    router.setDependency("", "empty");
    // @ts-expect-error: testing special keys
    router.setDependency("api:v2", "colon");
    // @ts-expect-error: testing special keys
    router.setDependency("用户", "unicode");

    router.resetDependencies();

    // @ts-expect-error: testing special keys
    expect(router.hasDependency("")).toBe(false);
    // @ts-expect-error: testing special keys
    expect(router.hasDependency("api:v2")).toBe(false);
    // @ts-expect-error: testing special keys
    expect(router.hasDependency("用户")).toBe(false);
  });

  it("should support full reinitialization pattern", () => {
    // Initial setup
    router.setDependencies({ foo: 1, bar: "old" });

    // Full reinitialization
    const result = router
      .resetDependencies()
      // @ts-expect-error: testing new keys after reset
      .setDependency("baz", "new1")
      // @ts-expect-error: testing new keys after reset
      .setDependency("qux", "new2");

    expect(result).toBe(router);

    // Old dependencies should be gone
    expect(router.hasDependency("foo")).toBe(false);
    expect(router.hasDependency("bar")).toBe(false);

    // New dependencies should exist
    expect(router.getDependency("baz" as "foo")).toBe("new1");
    expect(router.getDependency("qux" as "foo")).toBe("new2");
  });

  it("should remove falsy values as well", () => {
    router.setDependency("foo", 0 as number);
    // @ts-expect-error: testing null value
    router.setDependency("bar", null);
    router.setDependency("baz", false);

    router.resetDependencies();

    expect(router.hasDependency("foo")).toBe(false);
    expect(router.hasDependency("bar")).toBe(false);
    expect(router.hasDependency("baz")).toBe(false);
  });

  it("should integrate correctly in test isolation pattern", () => {
    // Simulate test 1
    // @ts-expect-error: testing new keys
    router.setDependency("testDep1", "value1");

    expect(router.hasDependency("testDep1" as "foo")).toBe(true);

    // Cleanup between tests
    router.resetDependencies();

    // Simulate test 2 - should not see test 1 dependencies
    expect(router.hasDependency("testDep1" as "foo")).toBe(false);

    // @ts-expect-error: testing new keys
    router.setDependency("testDep2", "value2");

    expect(router.hasDependency("testDep2" as "foo")).toBe(true);

    // Cleanup
    router.resetDependencies();

    expect(router.hasDependency("testDep2" as "foo")).toBe(false);
  });
});
