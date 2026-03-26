import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createDependenciesTestRouter } from "./setup";
import { getDependenciesApi } from "../../../../src/api";

import type { TestDependencies } from "./setup";
import type { Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/types";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/setDependencies", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should set multiple dependencies at once", () => {
    deps.setAll({ foo: 42, bar: "test" });

    expect(deps.get("foo")).toBe(42);
    expect(deps.get("bar")).toBe("test");
  });

  it("should ignore undefined values", () => {
    // @ts-expect-error: wrong values for test
    deps.setAll({ foo: undefined, bar: "value" });

    expect(deps.get("foo")).toBe(1);
    expect(deps.get("bar")).toBe("value");
  });

  it("should NOT warn via logger when overwriting multiple dependencies (no validation plugin)", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.setAll({ foo: 1, bar: "initial" });
    warnSpy.mockClear();

    deps.setAll({ foo: 2, bar: "new" });

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should not warn when no overwrites occur", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.setAll({ foo: 1, bar: "test" });
    warnSpy.mockClear();

    // @ts-expect-error: testing new keys
    deps.setAll({ baz: "new", qux: "another" });

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // 🟡 IMPORTANT: NaN handling
  it("should handle NaN values correctly", () => {
    deps.setAll({ foo: Number.NaN });

    const value = deps.get("foo");

    expect(Number.isNaN(value!)).toBe(true);
  });

  it("should silently ignore Symbol keys", () => {
    const symbolKey = Symbol("dep");
    const depsObj = {
      normal: "value",
      [symbolKey]: "symbol value",
    };

    // @ts-expect-error: testing symbol keys
    deps.setAll(depsObj);

    expect(deps.get("normal" as "foo")).toBe("value");
  });

  // 🟢 DESIRABLE: Empty object
  it("should handle empty object without changes", () => {
    deps.setAll({ foo: 1 });

    deps.setAll({});

    // State unchanged
    expect(deps.get("foo")).toBe(1);
    expect(deps.getAll()).toStrictEqual({ foo: 1 });
  });

  it("should handle object with all undefined values", () => {
    deps.setAll({ foo: 1 });

    // @ts-expect-error: testing all undefined
    deps.setAll({ bar: undefined, baz: undefined });

    // Only foo remains
    expect(deps.getAll()).toStrictEqual({ foo: 1 });
  });

  // 🟢 DESIRABLE: String conversion
  it("should convert numeric keys to strings", () => {
    // @ts-expect-error: testing numeric keys
    deps.setAll({ 123: "numeric", 456: "another" });

    expect(deps.get("123" as "foo")).toBe("numeric");
    expect(deps.get("456" as "foo")).toBe("another");
  });

  // Integration with other methods
  it("should integrate correctly with setDependency", () => {
    deps.set("foo", 1);
    deps.setAll({ bar: "test" });

    expect(deps.get("foo")).toBe(1);
    expect(deps.get("bar")).toBe("test");
  });

  it("should support conditional setup with undefined", () => {
    const isDev = false;
    const hasCache = true;

    deps.setAll({
      foo: 42,

      bar: (isDev as boolean) ? "dev-logger" : undefined,
      // @ts-expect-error: testing conditional setup
      baz: (hasCache as boolean) ? "cache-service" : undefined,
    });

    expect(deps.get("foo")).toBe(42);
    expect(deps.has("bar")).toBe(false); // undefined ignored
    expect(deps.get("baz" as "foo")).toBe("cache-service");
  });

  it("should handle falsy values except undefined", () => {
    deps.setAll({
      foo: 0 as number,
      // @ts-expect-error: testing null value
      bar: null,
      baz: false,
      qux: {},
    });

    expect(deps.get("foo")).toBe(0);
    expect(deps.get("bar")).toBe(null);
    expect(deps.get("baz")).toBe(false);
    expect(deps.get("qux")).toStrictEqual({});
  });

  it("should preserve circular references", () => {
    const obj1 = { name: "obj1" } as Record<string, unknown>;
    const obj2: Record<string, unknown> = { name: "obj2", ref: obj1 };

    obj1.ref = obj2; // Circular reference

    // @ts-expect-error: testing circular references
    deps.setAll({ circular: obj1 });

    const retrieved = deps.get("circular" as "foo");

    // @ts-expect-error: accessing nested properties
    expect(retrieved.name).toBe("obj1");
    // @ts-expect-error: accessing nested properties
    expect(retrieved.ref.name).toBe("obj2");
    // @ts-expect-error: accessing nested properties
    expect(retrieved.ref.ref).toBe(retrieved); // Circular preserved
  });
});
