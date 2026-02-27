import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import { createDependenciesTestRouter } from "./setup";

import type { TestDependencies } from "./setup";
import type { Router, DependenciesApi } from "@real-router/core";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/getDependencies", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return shallow copy of all dependencies", () => {
    const depsObj = deps.getAll();

    expect(depsObj).toStrictEqual({ foo: 1 });
    expect(depsObj).not.toBe(deps.getAll()); // different objects
  });

  it("should return new object on each call", () => {
    const deps1 = deps.getAll();
    const deps2 = deps.getAll();

    expect(deps1).toStrictEqual(deps2);
    expect(deps1).not.toBe(deps2);
  });

  it("should return empty object when no dependencies", () => {
    deps.reset();
    const depsObj = deps.getAll();

    expect(depsObj).toStrictEqual({});
  });

  it("should copy falsy values correctly", () => {
    deps.set("foo", 0 as number);
    // @ts-expect-error: testing null value
    deps.set("bar", null);

    const depsObj = deps.getAll();

    expect(depsObj.foo).toBe(0);
    expect(depsObj.bar).toBe(null);
  });

  it("should protect structure but not content (shallow copy)", () => {
    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    const service = { baseUrl: "http://api.com" };

    // @ts-expect-error: testing object value
    deps.set("foo", service);

    const depsObj = deps.getAll();

    // Modifying structure does NOT affect router
    // @ts-expect-error: testing adding new key
    depsObj.newKey = "value";

    expect(deps.has("newKey" as "foo")).toBe(false);

    delete depsObj.foo;

    expect(deps.has("foo")).toBe(true);

    // But modifying content DOES affect original (shallow copy)
    const depsAgain = deps.getAll();
    // @ts-expect-error: accessing object property

    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    depsAgain.foo.baseUrl = "http://new.com";

    // eslint-disable-next-line sonarjs/no-clear-text-protocols
    expect(service.baseUrl).toBe("http://new.com");
  });

  it("should integrate with setDependency", () => {
    deps.set("bar", "new value");
    const depsObj = deps.getAll();

    expect(depsObj.bar).toBe("new value");
  });

  it("should integrate with removeDependency", () => {
    deps.remove("foo");
    const depsObj = deps.getAll();

    expect(depsObj.foo).toBeUndefined();
  });
});
