import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "@real-router/core";

let router: Router<TestDependencies>;

describe("core/dependencies/getDependencies", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return shallow copy of all dependencies", () => {
    const deps = router.getDependencies();

    expect(deps).toStrictEqual({ foo: 1 });
    expect(deps).not.toBe(router.getDependencies()); // different objects
  });

  it("should return new object on each call", () => {
    const deps1 = router.getDependencies();
    const deps2 = router.getDependencies();

    expect(deps1).toStrictEqual(deps2);
    expect(deps1).not.toBe(deps2);
  });

  it("should return empty object when no dependencies", () => {
    router.resetDependencies();
    const deps = router.getDependencies();

    expect(deps).toStrictEqual({});
  });

  it("should copy falsy values correctly", () => {
    router.setDependency("foo", 0 as number);
    // @ts-expect-error: testing null value
    router.setDependency("bar", null);

    const deps = router.getDependencies();

    expect(deps.foo).toBe(0);
    expect(deps.bar).toBe(null);
  });

  it("should protect structure but not content (shallow copy)", () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    const service = { baseUrl: "http://api.com" };

    // @ts-expect-error: testing object value
    router.setDependency("foo", service);

    const deps = router.getDependencies();

    // Modifying structure does NOT affect router
    // @ts-expect-error: testing adding new key
    deps.newKey = "value";

    expect(router.hasDependency("newKey" as "foo")).toBe(false);

    delete deps.foo;

    expect(router.hasDependency("foo")).toBe(true);

    // But modifying content DOES affect original (shallow copy)
    const depsAgain = router.getDependencies();
    // @ts-expect-error: accessing object property

    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    depsAgain.foo.baseUrl = "http://new.com";

    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    expect(service.baseUrl).toBe("http://new.com");
  });

  it("should integrate with setDependency", () => {
    router.setDependency("bar", "new value");
    const deps = router.getDependencies();

    expect(deps.bar).toBe("new value");
  });

  it("should integrate with removeDependency", () => {
    router.removeDependency("foo");
    const deps = router.getDependencies();

    expect(deps.foo).toBeUndefined();
  });
});
