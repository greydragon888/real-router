import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "@real-router/core";

let router: Router<TestDependencies>;

describe("core/dependencies/setDependencies", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should set multiple dependencies at once", () => {
    router.setDependencies({ foo: 42, bar: "test" });

    expect(router.getDependency("foo")).toBe(42);
    expect(router.getDependency("bar")).toBe("test");
  });

  it("should ignore undefined values", () => {
    // @ts-expect-error: wrong values for test
    router.setDependencies({ foo: undefined, bar: "value" });

    expect(router.getDependency("foo")).toBe(1); // initial value
    expect(router.getDependency("bar")).toBe("value");
  });

  it("should return the router instance for chaining", () => {
    const result = router.setDependencies({ bar: "x" });

    expect(result).toBe(router);
  });

  // 🔴 CRITICAL: Plain object validation
  it("should reject null with TypeError", () => {
    expect(() => {
      // @ts-expect-error: testing null
      router.setDependencies(null);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing null
      router.setDependencies(null);
    }).toThrowError("expected plain object, received null");
  });

  it("should reject arrays with TypeError", () => {
    expect(() => {
      // @ts-expect-error: testing array
      router.setDependencies([]);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing array
      router.setDependencies(["dep1", "dep2"]);
    }).toThrowError(/expected plain object.*array/i);
  });

  it("should reject class instances with TypeError", () => {
    class MyClass {
      dep = "value";
    }
    const instance = new MyClass();

    expect(() => {
      // @ts-expect-error: testing class instance
      router.setDependencies(instance);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing class instance
      router.setDependencies(instance);
    }).toThrowError(/expected plain object.*myclass/i);
  });

  it("should reject Date objects with TypeError", () => {
    expect(() => {
      // @ts-expect-error: testing Date
      router.setDependencies(new Date());
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing Date
      router.setDependencies(new Date());
    }).toThrowError(/expected plain object.*date/i);
  });

  it("should reject Object.create(null) with TypeError", () => {
    const nullProto = Object.create(null);

    nullProto.dep = "value";

    expect(() => {
      router.setDependencies(nullProto);
    }).toThrowError(TypeError);
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
      router.setDependencies(withGetter);
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing getter
      router.setDependencies(withGetter);
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
      router.setDependencies(malicious);
    }).toThrowError(TypeError);

    // Getter should not have been invoked
    expect(getterCalled).toBe(false);
  });

  // 🔴 CRITICAL: Atomicity
  it("should be atomic - no changes if validation fails", () => {
    router.setDependencies({ foo: 1, bar: "initial" });

    const withGetter = {
      foo: 999,
      bar: "new",
      get invalid() {
        return "value";
      },
    };

    expect(() => {
      router.setDependencies(withGetter);
    }).toThrowError(TypeError);

    // State should remain unchanged
    expect(router.getDependency("foo")).toBe(1);
    expect(router.getDependency("bar")).toBe("initial");
  });

  // 🟡 IMPORTANT: Warnings for overwrites
  it("should warn with single message when overwriting multiple dependencies", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    router.setDependencies({ foo: 1, bar: "initial" });
    warnSpy.mockClear();

    router.setDependencies({ foo: 2, bar: "new" });

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

    router.setDependencies({ foo: 1, bar: "test" });
    warnSpy.mockClear();

    // @ts-expect-error: testing new keys
    router.setDependencies({ baz: "new", qux: "another" });

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // 🟡 IMPORTANT: NaN handling
  it("should handle NaN values correctly", () => {
    router.setDependencies({ foo: Number.NaN });

    const value = router.getDependency("foo");

    expect(Number.isNaN(value!)).toBe(true);
  });

  // 🟡 IMPORTANT: Symbol-keys behavior
  it("should silently ignore Symbol keys", () => {
    const symbolKey = Symbol("dep");
    const deps = {
      normal: "value",
      [symbolKey]: "symbol value",
    };

    // @ts-expect-error: testing symbol keys
    router.setDependencies(deps);

    expect(router.getDependency("normal" as "foo")).toBe("value");

    // Symbol key should be ignored
    // @ts-expect-error: testing symbol access
    expect(() => router.getDependency(symbolKey)).toThrowError();
  });

  // 🟢 DESIRABLE: Empty object
  it("should handle empty object without changes", () => {
    router.setDependencies({ foo: 1 });

    router.setDependencies({});

    // State unchanged
    expect(router.getDependency("foo")).toBe(1);
    expect(router.getDependencies()).toStrictEqual({ foo: 1 });
  });

  it("should handle object with all undefined values", () => {
    router.setDependencies({ foo: 1 });

    // @ts-expect-error: testing all undefined
    router.setDependencies({ bar: undefined, baz: undefined });

    // Only foo remains
    expect(router.getDependencies()).toStrictEqual({ foo: 1 });
  });

  // 🟢 DESIRABLE: String conversion
  it("should convert numeric keys to strings", () => {
    // @ts-expect-error: testing numeric keys
    router.setDependencies({ 123: "numeric", 456: "another" });

    expect(router.getDependency("123" as "foo")).toBe("numeric");
    expect(router.getDependency("456" as "foo")).toBe("another");
  });

  // Integration with other methods
  it("should integrate correctly with setDependency", () => {
    router.setDependency("foo", 1);
    router.setDependencies({ bar: "test" });

    expect(router.getDependency("foo")).toBe(1);
    expect(router.getDependency("bar")).toBe("test");
  });

  it("should support conditional setup with undefined", () => {
    const isDev = false;
    const hasCache = true;

    router.setDependencies({
      foo: 42,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      bar: isDev ? "dev-logger" : undefined,
      // @ts-expect-error: testing conditional setup
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      baz: hasCache ? "cache-service" : undefined,
    });

    expect(router.getDependency("foo")).toBe(42);
    expect(router.hasDependency("bar")).toBe(false); // undefined ignored
    expect(router.getDependency("baz" as "foo")).toBe("cache-service");
  });

  it("should handle falsy values except undefined", () => {
    router.setDependencies({
      foo: 0 as number,
      // @ts-expect-error: testing null value
      bar: null,
      baz: false,
      qux: {},
    });

    expect(router.getDependency("foo")).toBe(0);
    expect(router.getDependency("bar")).toBe(null);
    expect(router.getDependency("baz")).toBe(false);
    expect(router.getDependency("qux")).toStrictEqual({});
  });

  it("should preserve circular references", () => {
    const obj1 = { name: "obj1" } as Record<string, unknown>;
    const obj2: Record<string, unknown> = { name: "obj2", ref: obj1 };

    obj1.ref = obj2; // Circular reference

    // @ts-expect-error: testing circular references
    router.setDependencies({ circular: obj1 });

    const retrieved = router.getDependency("circular" as "foo");

    // @ts-expect-error: accessing nested properties
    expect(retrieved.name).toBe("obj1");
    // @ts-expect-error: accessing nested properties
    expect(retrieved.ref.name).toBe("obj2");
    // @ts-expect-error: accessing nested properties
    expect(retrieved.ref.ref).toBe(retrieved); // Circular preserved
  });
});
