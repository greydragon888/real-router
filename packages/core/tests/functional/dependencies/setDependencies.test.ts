import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { DependenciesApi, Router } from "@real-router/core";

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

    expect(deps.get("foo")).toBe(1); // initial value
    expect(deps.get("bar")).toBe("value");
  });

  // 🔴 CRITICAL: Plain object validation
  it("should reject null with TypeError", () => {
    expect(() => {
      // @ts-expect-error: testing null
      deps.setAll(null);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing null
      deps.setAll(null);
    }).toThrowError("expected plain object, received null");
  });

  it("should reject arrays with TypeError", () => {
    expect(() => {
      // @ts-expect-error: testing array
      deps.setAll([]);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing array
      deps.setAll(["dep1", "dep2"]);
    }).toThrowError(/expected plain object.*array/i);
  });

  it("should reject class instances with TypeError", () => {
    class MyClass {
      dep = "value";
    }
    const instance = new MyClass();

    expect(() => {
      // @ts-expect-error: testing class instance
      deps.setAll(instance);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing class instance
      deps.setAll(instance);
    }).toThrowError(/expected plain object.*myclass/i);
  });

  it("should reject Date objects with TypeError", () => {
    expect(() => {
      // @ts-expect-error: testing Date
      deps.setAll(new Date());
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing Date
      deps.setAll(new Date());
    }).toThrowError(/expected plain object.*date/i);
  });

  // 🔴 CRITICAL: Getters prohibition
  it("should reject objects with getters", () => {
    const withGetter = {
      normal: "value",
      // Intentionally unused getter - testing validation
      get computed() {
        return "computed value";
      },
    };

    expect(() => {
      // @ts-expect-error: testing getter
      deps.setAll(withGetter);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing getter
      deps.setAll(withGetter);
    }).toThrowError(/getters not allowed.*computed/i);
  });

  it("should not invoke getters during validation", () => {
    let getterCalled = false;
    const malicious = {
      safe: "value",
      // Intentionally unused getter - testing that it's not invoked
      get dangerous() {
        getterCalled = true;

        throw new Error("This should never be thrown");
      },
    };

    expect(() => {
      // @ts-expect-error: testing getter
      deps.setAll(malicious);
    }).toThrowError(TypeError);

    // Getter should not have been invoked
    expect(getterCalled).toBe(false);
  });

  // 🔴 CRITICAL: Atomicity
  it("should be atomic - no changes if validation fails", () => {
    deps.setAll({ foo: 1, bar: "initial" });

    const withGetter = {
      foo: 999,
      bar: "new",
      get invalid() {
        return "value";
      },
    };

    expect(() => {
      deps.setAll(withGetter);
    }).toThrowError(TypeError);

    // State should remain unchanged
    expect(deps.get("foo")).toBe(1);
    expect(deps.get("bar")).toBe("initial");
  });

  // 🟡 IMPORTANT: Warnings for overwrites
  it("should warn with single message when overwriting multiple dependencies", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.setAll({ foo: 1, bar: "initial" });
    warnSpy.mockClear();

    deps.setAll({ foo: 2, bar: "new" });

    // Single warning with both keys
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const callArgs = warnSpy.mock.calls[0];

    // Logger format: logger.warn(context, message, ...args)
    expect(callArgs[0]).toBe("router.setDependencies");
    expect(callArgs[1]).toBe("Overwritten:");
    expect(callArgs[2]).toContain("foo");
    expect(callArgs[2]).toContain("bar");

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

  // 🟡 IMPORTANT: Symbol-keys behavior
  it("should silently ignore Symbol keys", () => {
    const symbolKey = Symbol("dep");
    const depsObj = {
      normal: "value",
      [symbolKey]: "symbol value",
    };

    // @ts-expect-error: testing symbol keys
    deps.setAll(depsObj);

    expect(deps.get("normal" as "foo")).toBe("value");

    // Symbol key should be ignored
    // @ts-expect-error: testing symbol access
    expect(() => deps.get(symbolKey)).toThrowError();
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
