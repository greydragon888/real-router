import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getDependenciesApi } from "@real-router/core";

import { createDependenciesTestRouter } from "./setup";

import type { TestDependencies } from "./setup";
import type { DependenciesApi, Router } from "@real-router/core";

let router: Router<TestDependencies>;
let deps: DependenciesApi<TestDependencies>;

describe("core/dependencies/setDependency", () => {
  beforeEach(() => {
    router = createDependenciesTestRouter();
    deps = getDependenciesApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should set a new dependency", () => {
    deps.set("bar", "hello");

    expect(deps.get("bar")).toBe("hello");
  });

  it("should overwrite existing dependency", () => {
    deps.set("foo", 2);

    expect(deps.get("foo")).toBe(2);
  });

  // 🔴 CRITICAL: undefined semantics
  it("should ignore undefined values without setting", () => {
    deps.set("foo", undefined);

    // Should keep initial value
    expect(deps.get("foo")).toBe(1);
  });

  it("should not add new dependency when value is undefined", () => {
    // @ts-expect-error: testing undefined value
    deps.set("newKey", undefined);

    expect(deps.has("newKey" as "foo")).toBe(false);
  });

  it("should throw TypeError for invalid key even when value is undefined", () => {
    // Key validation happens BEFORE undefined check - consistent validation
    expect(() => {
      // @ts-expect-error: testing invalid key with undefined
      deps.set(null, undefined);
    }).toThrowError(TypeError);

    expect(() => {
      // @ts-expect-error: testing invalid key with undefined
      deps.set(123, undefined);
    }).toThrowError(TypeError);

    expect(() => {
      // @ts-expect-error: testing invalid key with undefined
      deps.set({}, undefined);
    }).toThrowError(TypeError);
  });

  it("should allow conditional setup with undefined", () => {
    const isDev = false;

    // @ts-expect-error: testing conditional setup

    deps.set("devLogger", (isDev as boolean) ? console : undefined);

    expect(deps.has("devLogger" as "foo")).toBe(false);
  });

  // 🔴 CRITICAL: Key validation
  it("should throw TypeError for non-string keys", () => {
    expect(() => {
      // @ts-expect-error: testing number key
      deps.set(123, "value");
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing number key
      deps.set(123, "value");
    }).toThrowError("dependency name must be a string, got number");
  });

  it("should throw TypeError for null key", () => {
    expect(() => {
      // @ts-expect-error: testing null key
      deps.set(null, "value");
    }).toThrowError(TypeError);
    expect(() => {
      // @ts-expect-error: testing null key
      deps.set(null, "value");
    }).toThrowError("dependency name must be a string, got object");
  });

  it("should throw TypeError for object key", () => {
    expect(() => {
      // @ts-expect-error: testing object key
      deps.set({}, "value");
    }).toThrowError(TypeError);
  });

  // 🟡 IMPORTANT: Warning on overwrite
  it("should warn when overwriting existing dependency", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.set("foo", 1);
    warnSpy.mockClear();

    deps.set("foo", 2);

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
    deps.set("newDep", "value");

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // 🟡 IMPORTANT: Idempotency
  it("should not warn when setting same value repeatedly", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.set("foo", 42 as number);
    warnSpy.mockClear();

    deps.set("foo", 42 as number);

    // Same value - no warning expected
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("should handle NaN idempotency correctly", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    deps.set("foo", Number.NaN);
    warnSpy.mockClear();

    deps.set("foo", Number.NaN);

    // NaN special handling - no warning
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  // 🟢 DESIRABLE: Empty string key
  it("should accept empty string as valid key", () => {
    // @ts-expect-error: testing empty string key
    deps.set("", "empty-key-value");

    // @ts-expect-error: testing empty string key
    expect(deps.get("")).toBe("empty-key-value");
  });

  // 🟢 DESIRABLE: Special key names
  it("should handle special key names safely", () => {
    // These are safe because of Object.create(null)
    // @ts-expect-error: testing special keys
    deps.set("constructor", "safe1");
    // @ts-expect-error: testing special keys
    deps.set("__proto__", "safe2");
    // @ts-expect-error: testing special keys
    deps.set("hasOwnProperty", "safe3");

    expect(deps.get("constructor" as "foo")).toBe("safe1");
    expect(deps.get("__proto__" as "foo")).toBe("safe2");
    expect(deps.get("hasOwnProperty" as "foo")).toBe("safe3");
  });

  // Handling different value types
  it("should distinguish null from undefined", () => {
    // @ts-expect-error: testing null value
    deps.set("foo", null);

    expect(deps.get("foo")).toBe(null);
    expect(deps.has("foo")).toBe(true);
  });

  it("should handle falsy values except undefined", () => {
    deps.set("foo", 0 as number);

    expect(deps.get("foo")).toBe(0);

    // @ts-expect-error: testing false value
    deps.set("bar", false);

    expect(deps.get("bar")).toBe(false);

    // @ts-expect-error: testing empty string
    deps.set("baz", "");

    expect(deps.get("baz" as "foo")).toBe("");
  });

  it("should handle special numeric values", () => {
    deps.set("foo", Infinity);

    expect(deps.get("foo")).toBe(Infinity);

    // @ts-expect-error: testing -Infinity
    deps.set("bar", -Infinity);

    expect(deps.get("bar")).toBe(-Infinity);
  });

  // Integration with other methods
  it("should work correctly with fluent chaining", () => {
    // @ts-expect-error: testing new keys
    deps.set("dep1", "val1");
    // @ts-expect-error: testing new keys
    deps.set("dep2", "val2");
    // @ts-expect-error: testing new keys
    deps.set("dep3", "val3");

    expect(deps.get("dep1" as "foo")).toBe("val1");
    expect(deps.get("dep2" as "foo")).toBe("val2");
    expect(deps.get("dep3" as "foo")).toBe("val3");
  });

  it("should integrate correctly with removeDependency", () => {
    // @ts-expect-error: testing new key
    deps.set("temp", "value");

    expect(deps.has("temp" as "foo")).toBe(true);

    // @ts-expect-error: testing new key
    deps.remove("temp");

    expect(deps.has("temp" as "foo")).toBe(false);

    // Can set again after removal
    // @ts-expect-error: testing new key
    deps.set("temp", "new-value");

    expect(deps.get("temp" as "foo")).toBe("new-value");
  });

  // Functions and classes as values
  it("should accept functions as dependency values", () => {
    const factory = () => ({ value: 42 });

    // @ts-expect-error: testing function value
    deps.set("factory", factory);

    const retrieved = deps.get("factory" as "foo");

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
    deps.set("ServiceClass", Service);

    const ServiceConstructor = deps.get("ServiceClass" as "foo");

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
    deps.set("circular", obj1);

    const retrieved = deps.get("circular" as "foo");

    // @ts-expect-error: accessing nested properties
    expect(retrieved.name).toBe("obj1");
    // @ts-expect-error: accessing nested properties
    expect(retrieved.ref.ref).toBe(retrieved);
  });
});
