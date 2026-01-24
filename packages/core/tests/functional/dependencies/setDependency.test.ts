import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createDependenciesTestRouter, type TestDependencies } from "./setup";

import type { Router } from "@real-router/core";

let router: Router<TestDependencies>;

describe("core/dependencies/setDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should set a new dependency", () => {
    router.setDependency("bar", "hello");

    expect(router.getDependency("bar")).toBe("hello");
  });

  it("should overwrite existing dependency", () => {
    router.setDependency("foo", 2);

    expect(router.getDependency("foo")).toBe(2);
  });

  it("should return the router instance for chaining", () => {
    const result = router.setDependency("foo", 3);

    expect(result).toBe(router);
  });

  // 🔴 CRITICAL: undefined semantics
  it("should ignore undefined values without setting", () => {
    router.setDependency("foo", undefined);

    // Should keep initial value
    expect(router.getDependency("foo")).toBe(1);
  });

  it("should not add new dependency when value is undefined", () => {
    // @ts-expect-error: testing undefined value
    router.setDependency("newKey", undefined);

    expect(router.hasDependency("newKey" as "foo")).toBe(false);
  });

  it("should not throw for invalid key when value is undefined", () => {
    // undefined check happens BEFORE key validation - this is a design decision
    // to support: setDependency(key, condition ? value : undefined)
    expect(() => {
      // @ts-expect-error: testing invalid key with undefined
      router.setDependency(null, undefined);
    }).not.toThrowError();

    expect(() => {
      // @ts-expect-error: testing invalid key with undefined
      router.setDependency(123, undefined);
    }).not.toThrowError();

    expect(() => {
      // @ts-expect-error: testing invalid key with undefined
      router.setDependency({}, undefined);
    }).not.toThrowError();
  });

  it("should allow conditional setup with undefined", () => {
    const isDev = false;

    // @ts-expect-error: testing conditional setup
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    router.setDependency("devLogger", isDev ? console : undefined);

    expect(router.hasDependency("devLogger" as "foo")).toBe(false);
  });

  // 🔴 CRITICAL: Key validation
  it("should throw TypeError for non-string keys", () => {
    expect(() => {
      // @ts-expect-error: testing number key
      router.setDependency(123, "value");
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing number key
      router.setDependency(123, "value");
    }).toThrowError("dependency name must be a string, got number");
  });

  it("should throw TypeError for null key", () => {
    expect(() => {
      // @ts-expect-error: testing null key
      router.setDependency(null, "value");
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing null key
      router.setDependency(null, "value");
    }).toThrowError("dependency name must be a string, got object");
  });

  it("should throw TypeError for object key", () => {
    expect(() => {
      // @ts-expect-error: testing object key
      router.setDependency({}, "value");
    }).toThrowError(TypeError);
  });

  // 🟡 IMPORTANT: Warning on overwrite
  it("should warn when overwriting existing dependency", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    router.setDependency("foo", 1);
    warnSpy.mockClear();

    router.setDependency("foo", 2);

    expect(warnSpy).toHaveBeenCalledTimes(1);

    const callArgs = warnSpy.mock.calls[0];

    // Logger format: logger.warn(context, message, ...args)
    expect(callArgs[0]).toBe("router.setDependency");
    expect(callArgs[1]).toContain("overwritten");
    expect(callArgs[2]).toBe("foo");

    warnSpy.mockRestore();
  });

  it("should not warn when setting new dependency", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    // @ts-expect-error: testing new key
    router.setDependency("newDep", "value");

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // 🟡 IMPORTANT: Idempotency
  it("should not warn when setting same value repeatedly", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    router.setDependency("foo", 42 as number);
    warnSpy.mockClear();

    router.setDependency("foo", 42 as number);

    // Same value - no warning expected
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should handle NaN idempotency correctly", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    router.setDependency("foo", Number.NaN);
    warnSpy.mockClear();

    router.setDependency("foo", Number.NaN);

    // NaN special handling - no warning
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // 🟢 DESIRABLE: Empty string key
  it("should accept empty string as valid key", () => {
    // @ts-expect-error: testing empty string key
    router.setDependency("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(router.getDependency("")).toBe("empty-key-value");
  });

  // 🟢 DESIRABLE: Special key names
  it("should handle special key names safely", () => {
    // These are safe because of Object.create(null)
    // @ts-expect-error: testing special keys
    router.setDependency("constructor", "safe1");
    // @ts-expect-error: testing special keys
    router.setDependency("__proto__", "safe2");
    // @ts-expect-error: testing special keys
    router.setDependency("hasOwnProperty", "safe3");

    expect(router.getDependency("constructor" as "foo")).toBe("safe1");
    expect(router.getDependency("__proto__" as "foo")).toBe("safe2");
    expect(router.getDependency("hasOwnProperty" as "foo")).toBe("safe3");
  });

  // Handling different value types
  it("should distinguish null from undefined", () => {
    // @ts-expect-error: testing null value
    router.setDependency("foo", null);

    expect(router.getDependency("foo")).toBe(null);
    expect(router.hasDependency("foo")).toBe(true);
  });

  it("should handle falsy values except undefined", () => {
    router.setDependency("foo", 0 as number);

    expect(router.getDependency("foo")).toBe(0);

    // @ts-expect-error: testing false value
    router.setDependency("bar", false);

    expect(router.getDependency("bar")).toBe(false);

    // @ts-expect-error: testing empty string
    router.setDependency("baz", "");

    expect(router.getDependency("baz" as "foo")).toBe("");
  });

  it("should handle special numeric values", () => {
    router.setDependency("foo", Infinity);

    expect(router.getDependency("foo")).toBe(Infinity);

    // @ts-expect-error: testing -Infinity
    router.setDependency("bar", -Infinity);

    expect(router.getDependency("bar")).toBe(-Infinity);
  });

  // Integration with other methods
  it("should work correctly with fluent chaining", () => {
    const result = router
      // @ts-expect-error: testing new keys
      .setDependency("dep1", "val1")
      // @ts-expect-error: testing new keys
      .setDependency("dep2", "val2")
      // @ts-expect-error: testing new keys
      .setDependency("dep3", "val3");

    expect(result).toBe(router);
    expect(router.getDependency("dep1" as "foo")).toBe("val1");
    expect(router.getDependency("dep2" as "foo")).toBe("val2");
    expect(router.getDependency("dep3" as "foo")).toBe("val3");
  });

  it("should integrate correctly with removeDependency", () => {
    // @ts-expect-error: testing new key
    router.setDependency("temp", "value");

    expect(router.hasDependency("temp" as "foo")).toBe(true);

    // @ts-expect-error: testing new key
    router.removeDependency("temp");

    expect(router.hasDependency("temp" as "foo")).toBe(false);

    // Can set again after removal
    // @ts-expect-error: testing new key
    router.setDependency("temp", "new-value");

    expect(router.getDependency("temp" as "foo")).toBe("new-value");
  });

  // Functions and classes as values
  it("should accept functions as dependency values", () => {
    const factory = () => ({ value: 42 });

    // @ts-expect-error: testing function value
    router.setDependency("factory", factory);

    const retrieved = router.getDependency("factory" as "foo");

    // @ts-expect-error: calling function
    expect(retrieved()).toStrictEqual({ value: 42 });
  });

  it("should accept class constructors as dependency values", () => {
    class Service {
      getValue() {
        return 42;
      }
    }

    // @ts-expect-error: testing class value
    router.setDependency("ServiceClass", Service);

    const ServiceConstructor = router.getDependency("ServiceClass" as "foo");

    // @ts-expect-error: creating instance
    // eslint-disable-next-line sonarjs/new-operator-misuse
    const instance = new ServiceConstructor();

    expect(instance.getValue()).toBe(42);
  });

  // Circular references
  it("should handle circular references without errors", () => {
    const obj1 = { name: "obj1" } as Record<string, unknown>;
    const obj2: Record<string, unknown> = { name: "obj2", ref: obj1 };

    obj1.ref = obj2; // Circular

    // @ts-expect-error: testing circular reference
    router.setDependency("circular", obj1);

    const retrieved = router.getDependency("circular" as "foo");

    // @ts-expect-error: accessing nested properties
    expect(retrieved.name).toBe("obj1");
    // @ts-expect-error: accessing nested properties
    expect(retrieved.ref.ref).toBe(retrieved);
  });
});
