import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createDependenciesTestRouter } from "./setup";
import { getDependenciesApi } from "../../../../src/api";

import type { TestDependencies } from "./setup";
import type { Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/types";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/hasDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should return true if dependency exists", () => {
    expect(deps.has("foo")).toBe(true);
  });

  it("should return false if dependency does not exist", () => {
    expect(deps.has("nonexistent" as "foo")).toBe(false);
  });

  it("should return false after dependency is removed", () => {
    deps.remove("foo");

    expect(deps.has("foo")).toBe(false);
  });

  it("should return true for falsy values", () => {
    deps.set("foo", 0 as number);

    expect(deps.has("foo")).toBe(true);

    // @ts-expect-error: testing null value
    deps.set("bar", null);

    expect(deps.has("bar")).toBe(true);

    // @ts-expect-error: testing false value
    deps.set("foo", false);

    expect(deps.has("foo")).toBe(true);
  });

  it("should throw TypeError for non-string parameters", () => {
    // Numbers should throw
    expect(() => {
      // @ts-expect-error: testing number parameter
      deps.has(123);
    }).toThrow(TypeError);

    // null should throw
    expect(() => {
      // @ts-expect-error: testing null parameter
      deps.has(null);
    }).toThrow(TypeError);

    // undefined should throw
    expect(() => {
      // @ts-expect-error: testing undefined parameter
      deps.has(undefined);
    }).toThrow(TypeError);
  });

  it("should be case-sensitive for dependency names", () => {
    const api1 = { name: "API1" };
    const api2 = { name: "API2" };

    // @ts-expect-error: testing different case keys
    deps.set("API", api1);
    // @ts-expect-error: testing different case keys
    deps.set("api", api2);

    // @ts-expect-error: testing different case keys
    expect(deps.has("API")).toBe(true);
    // @ts-expect-error: testing different case keys
    expect(deps.has("api")).toBe(true);
    // @ts-expect-error: testing different case keys
    expect(deps.has("Api")).toBe(false);
  });

  it("should accept empty string as valid key", () => {
    expect(deps.has("" as "foo")).toBe(false);

    // @ts-expect-error: testing empty string key
    deps.set("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(deps.has("")).toBe(true);
  });

  it("should integrate correctly with setDependency", () => {
    expect(deps.has("bar")).toBe(false);

    deps.set("bar", "new value");

    expect(deps.has("bar")).toBe(true);
  });

  it("should integrate correctly with resetDependencies", () => {
    deps.setAll({ foo: 1, bar: "value" });

    expect(deps.has("foo")).toBe(true);
    expect(deps.has("bar")).toBe(true);

    deps.reset();

    expect(deps.has("foo")).toBe(false);
    expect(deps.has("bar")).toBe(false);
  });

  it("should handle special characters and Unicode in dependency names", () => {
    // @ts-expect-error: testing special character keys
    deps.set("api:v2", "value");

    // @ts-expect-error: testing special character keys
    expect(deps.has("api:v2")).toBe(true);

    // @ts-expect-error: testing unicode keys
    deps.set("用户", "user");

    // @ts-expect-error: testing unicode keys
    expect(deps.has("用户")).toBe(true);

    // @ts-expect-error: testing emoji keys
    deps.set("🚀", "rocket");

    // @ts-expect-error: testing emoji keys
    expect(deps.has("🚀")).toBe(true);
  });
});
