import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "@real-router/core";

let router: Router<TestDependencies>;

describe("core/dependencies/hasDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should return true if dependency exists", () => {
    expect(router.hasDependency("foo")).toBe(true);
  });

  it("should return false if dependency does not exist", () => {
    expect(router.hasDependency("nonexistent" as "foo")).toBe(false);
  });

  it("should return false after dependency is removed", () => {
    router.removeDependency("foo");

    expect(router.hasDependency("foo")).toBe(false);
  });

  it("should return true for falsy values", () => {
    router.setDependency("foo", 0 as number);

    expect(router.hasDependency("foo")).toBe(true);

    // @ts-expect-error: testing null value
    router.setDependency("bar", null);

    expect(router.hasDependency("bar")).toBe(true);

    // @ts-expect-error: testing false value
    router.setDependency("foo", false);

    expect(router.hasDependency("foo")).toBe(true);
  });

  it("should throw TypeError for non-string parameters", () => {
    // Numbers should throw
    expect(() => {
      // @ts-expect-error: testing number parameter
      router.hasDependency(123);
    }).toThrowError(TypeError);

    // null should throw
    expect(() => {
      // @ts-expect-error: testing null parameter
      router.hasDependency(null);
    }).toThrowError(TypeError);

    // undefined should throw
    expect(() => {
      // @ts-expect-error: testing undefined parameter
      router.hasDependency(undefined);
    }).toThrowError(TypeError);
  });

  it("should be case-sensitive for dependency names", () => {
    const api1 = { name: "API1" };
    const api2 = { name: "API2" };

    // @ts-expect-error: testing different case keys
    router.setDependency("API", api1);
    // @ts-expect-error: testing different case keys
    router.setDependency("api", api2);

    // @ts-expect-error: testing different case keys
    expect(router.hasDependency("API")).toBe(true);
    // @ts-expect-error: testing different case keys
    expect(router.hasDependency("api")).toBe(true);
    // @ts-expect-error: testing different case keys
    expect(router.hasDependency("Api")).toBe(false);
  });

  it("should accept empty string as valid key", () => {
    expect(router.hasDependency("" as "foo")).toBe(false);

    // @ts-expect-error: testing empty string key
    router.setDependency("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(router.hasDependency("")).toBe(true);
  });

  it("should integrate correctly with setDependency", () => {
    expect(router.hasDependency("bar")).toBe(false);

    router.setDependency("bar", "new value");

    expect(router.hasDependency("bar")).toBe(true);
  });

  it("should integrate correctly with resetDependencies", () => {
    router.setDependencies({ foo: 1, bar: "value" });

    expect(router.hasDependency("foo")).toBe(true);
    expect(router.hasDependency("bar")).toBe(true);

    router.resetDependencies();

    expect(router.hasDependency("foo")).toBe(false);
    expect(router.hasDependency("bar")).toBe(false);
  });

  it("should handle special characters and Unicode in dependency names", () => {
    // @ts-expect-error: testing special character keys
    router.setDependency("api:v2", "value");

    // @ts-expect-error: testing special character keys
    expect(router.hasDependency("api:v2")).toBe(true);

    // @ts-expect-error: testing unicode keys
    router.setDependency("用户", "user");

    // @ts-expect-error: testing unicode keys
    expect(router.hasDependency("用户")).toBe(true);

    // @ts-expect-error: testing emoji keys
    router.setDependency("🚀", "rocket");

    // @ts-expect-error: testing emoji keys
    expect(router.hasDependency("🚀")).toBe(true);
  });
});
