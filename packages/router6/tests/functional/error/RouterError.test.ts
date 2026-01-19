import { describe, it, expect } from "vitest";

import { RouterError, errorCodes } from "router6";

describe("RouterError", () => {
  it("should create an instance with code and default message", () => {
    const err = new RouterError("ERR_CODE");

    expect(err).toBeInstanceOf(RouterError);
    expect(err.code).toBe("ERR_CODE");
    expect(err.message).toBe("ERR_CODE");
    expect(err.segment).toBe(undefined);
    expect(err.redirect).toBe(undefined);
  });

  it("should set message, segment, redirect and custom fields", () => {
    const redirect = { name: "home", path: "/", params: {} };
    const err = new RouterError("ERR_CODE", {
      message: "Custom message",
      segment: "users",
      redirect,
      custom: 123,
    });

    expect(err.code).toBe("ERR_CODE");
    expect(err.message).toBe("Custom message");
    expect(err.segment).toBe("users");
    // redirect is a frozen clone, not the same reference
    expect(err.redirect).not.toBe(redirect);
    expect(err.redirect).toStrictEqual(redirect);
    expect(Object.isFrozen(err.redirect)).toBe(true);
    expect(err.custom).toBe(123);
  });

  describe("setCode", () => {
    it("should update code and message with setCode", () => {
      const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
        message: errorCodes.ROUTE_NOT_FOUND,
      });

      err.setCode("NEW_CODE");

      expect(err.code).toBe("NEW_CODE");
      expect(err.message).toBe("NEW_CODE");
    });

    it("should update only code if message is custom in setCode", () => {
      const err = new RouterError("ERR", { message: "Custom" });

      err.setCode("NEW_CODE");

      expect(err.code).toBe("NEW_CODE");
      expect(err.message).toBe("Custom");
    });
  });

  describe("setErrorInstance", () => {
    it("should set error instance with stack fields with setErrorInstance", () => {
      const err = new RouterError("ERR");
      const nativeWithStack = new Error("Native error");

      nativeWithStack.stack = "stacktrace";
      nativeWithStack.cause = "cause";

      err.setErrorInstance(nativeWithStack);

      expect(err.message).toBe("Native error");
      expect(err.cause).toBe("cause");
      expect(err.stack).toBe("stacktrace");
    });

    it("should set error instance without stack fields with setErrorInstance", () => {
      const err = new RouterError("ERR");

      const nativeWithoutStack = new Error("Native error");

      // @ts-expect-error: idk how to test it
      nativeWithoutStack.stack = undefined;
      nativeWithoutStack.cause = "cause";

      err.setErrorInstance(nativeWithoutStack);

      expect(err.message).toBe("Native error");
      expect(err.cause).toBe("cause");
      expect(err.stack).toBe("");
    });
  });

  describe("setAdditionalFields", () => {
    it("should set additional fields with setAdditionalFields", () => {
      const err = new RouterError("ERR");

      err.setAdditionalFields({ foo: "bar", num: 42 });

      expect(err.foo).toBe("bar");
      expect(err.num).toBe(42);
    });
  });

  it("should allow arbitrary fields via index signature", () => {
    const err = new RouterError("ERR");

    err.extra = "value";

    expect(err.extra).toBe("value");
  });

  it("should set path field via constructor", () => {
    const err = new RouterError("ERR", {
      path: "/users/123",
    });

    expect(err.path).toBe("/users/123");
  });

  describe("hasField", () => {
    it("should return true for existing field", () => {
      const err = new RouterError("ERR");

      err.setAdditionalFields({ customField: "value" });

      expect(err.hasField("customField")).toBe(true);
    });

    it("should return false for non-existing field", () => {
      const err = new RouterError("ERR");

      expect(err.hasField("nonExistent")).toBe(false);
    });

    it("should return true for built-in fields", () => {
      const err = new RouterError("ERR", { message: "test" });

      expect(err.hasField("message")).toBe(true);
      expect(err.hasField("code")).toBe(true);
    });
  });

  describe("getField", () => {
    it("should return field value for existing field", () => {
      const err = new RouterError("ERR");

      err.setAdditionalFields({ myField: 42 });

      expect(err.getField("myField")).toBe(42);
    });

    it("should return undefined for non-existing field", () => {
      const err = new RouterError("ERR");

      expect(err.getField("nonExistent")).toBe(undefined);
    });

    it("should return value for built-in fields", () => {
      const err = new RouterError("ERR_CODE", { message: "test message" });

      expect(err.getField("message")).toBe("test message");
      expect(err.getField("code")).toBe("ERR_CODE");
    });
  });

  describe("toJSON", () => {
    it("should serialize basic error with code and message", () => {
      const err = new RouterError("ERR_CODE", { message: "Error message" });

      const json = err.toJSON();

      expect(json).toStrictEqual({
        code: "ERR_CODE",
        message: "Error message",
      });
    });

    it("should include segment and path when present", () => {
      const err = new RouterError("ERR", {
        segment: "users",
        path: "/users/123",
      });

      const json = err.toJSON();

      expect(json).toStrictEqual({
        code: "ERR",
        message: "ERR",
        segment: "users",
        path: "/users/123",
      });
    });

    it("should include redirect when present", () => {
      const redirect = { name: "home", path: "/", params: {} };
      const err = new RouterError("ERR", { redirect });

      const json = err.toJSON();

      expect(json).toStrictEqual({
        code: "ERR",
        message: "ERR",
        redirect,
      });
    });

    it("should include custom fields but exclude stack", () => {
      const err = new RouterError("ERR", {
        customField: "value",
        anotherField: 123,
      });

      err.stack = "stack trace here";

      const json = err.toJSON();

      expect(json).toStrictEqual({
        code: "ERR",
        message: "ERR",
        customField: "value",
        anotherField: 123,
      });
      expect(json.stack).toBeUndefined();
    });

    it("should serialize all fields together", () => {
      const redirect = { name: "admin", path: "/admin", params: { id: "1" } };
      const err = new RouterError("FORBIDDEN", {
        message: "Access denied",
        segment: "admin",
        path: "/admin/settings",
        redirect,
        userId: 42,
        reason: "insufficient permissions",
      });

      const json = err.toJSON();

      expect(json).toStrictEqual({
        code: "FORBIDDEN",
        message: "Access denied",
        segment: "admin",
        path: "/admin/settings",
        redirect,
        userId: 42,
        reason: "insufficient permissions",
      });
    });
  });

  describe("redirect deep freeze", () => {
    it("should freeze redirect state when accessed via getter", () => {
      const redirect = { name: "home", path: "/", params: {} };
      const err = new RouterError("ERR", { redirect });

      const frozenRedirect = err.redirect;

      expect(Object.isFrozen(frozenRedirect)).toBe(true);
    });

    it("should return undefined when redirect is not set", () => {
      const err = new RouterError("ERR");

      expect(err.redirect).toBe(undefined);
    });
  });

  describe("Error inheritance", () => {
    it("should be instance of Error", () => {
      const err = new RouterError("ERR");

      expect(err).toBeInstanceOf(Error);
    });

    it("should be instance of RouterError", () => {
      const err = new RouterError("ERR");

      expect(err).toBeInstanceOf(RouterError);
    });

    it("should have error name", () => {
      const err = new RouterError("ERR");

      expect(err.name).toBe("Error");
    });
  });

  describe("Edge cases", () => {
    describe("Constructor edge cases", () => {
      it("should handle empty string code", () => {
        const err = new RouterError("");

        expect(err.code).toBe("");
        expect(err.message).toBe("");
      });

      it("should handle very long code string", () => {
        const longCode = "A".repeat(10_000);
        const err = new RouterError(longCode);

        expect(err.code).toBe(longCode);
        expect(err.code).toHaveLength(10_000);
      });

      it("should handle special characters in code", () => {
        const specialCode = String.raw`ERR@#$%^&*()_+-={}[]|\:;"'<>?,./`;
        const err = new RouterError(specialCode);

        expect(err.code).toBe(specialCode);
      });

      it("should handle unicode in code and message", () => {
        const err = new RouterError("ERR_日本語", {
          message: "エラーが発生しました 🔥",
        });

        expect(err.code).toBe("ERR_日本語");
        expect(err.message).toBe("エラーが発生しました 🔥");
      });

      it("should protect methods from being overwritten by custom fields", () => {
        // Reserved method names should be filtered out
        const err = new RouterError("ERR", {
          setCode: "not a function",
          toJSON: "not a function",
          hasField: 123,
          getField: "also not a function",
          setAdditionalFields: "nope",
          setErrorInstance: "blocked",
        });

        // Methods should NOT be overwritten (protected by reservedKeys filter)
        expect(typeof err.setCode).toBe("function");
        expect(typeof err.toJSON).toBe("function");
        expect(typeof err.hasField).toBe("function");
        expect(typeof err.getField).toBe("function");
        expect(typeof err.setAdditionalFields).toBe("function");
        expect(typeof err.setErrorInstance).toBe("function");

        // Verify methods still work correctly
        expect(err.hasField("code")).toBe(true);
        expect(err.getField("code")).toBe("ERR");
      });

      it("should handle null values in custom fields", () => {
        const err = new RouterError("ERR", {
          nullField: null,
          definedField: "value",
        });

        expect(err.nullField).toBeNull();
        expect(err.definedField).toBe("value");
      });

      it("should handle undefined values in custom fields", () => {
        const err = new RouterError("ERR", {
          undefinedField: undefined,
          definedField: "value",
        });

        expect(err.undefinedField).toBeUndefined();
        expect(err.definedField).toBe("value");
      });
    });

    describe("setCode edge cases", () => {
      it("should handle empty string", () => {
        const err = new RouterError("INITIAL_CODE");

        err.setCode("");

        expect(err.code).toBe("");
      });

      it("should handle special characters", () => {
        const err = new RouterError("INITIAL");
        const specialCode = "@#$%^&*()";

        err.setCode(specialCode);

        expect(err.code).toBe(specialCode);
      });

      it("should handle multiple calls to setCode", () => {
        const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, {
          message: errorCodes.ROUTE_NOT_FOUND,
        });

        // First call: message is an errorCode value, so it gets updated
        err.setCode("CODE1");

        expect(err.code).toBe("CODE1");
        expect(err.message).toBe("CODE1");

        // Second call: message is now "CODE1" which is NOT an errorCode value
        // So message stays as "CODE1" while code changes
        err.setCode("CODE2");

        expect(err.code).toBe("CODE2");
        expect(err.message).toBe("CODE1"); // Message doesn't change

        // Third call: same behavior
        err.setCode("CODE3");

        expect(err.code).toBe("CODE3");
        expect(err.message).toBe("CODE1"); // Message still doesn't change
      });

      it("should handle very long code string", () => {
        const err = new RouterError("INITIAL");
        const longCode = "X".repeat(50_000);

        err.setCode(longCode);

        expect(err.code).toBe(longCode);
        expect(err.code).toHaveLength(50_000);
      });
    });

    describe("setErrorInstance edge cases", () => {
      it("should throw TypeError when err is null or undefined", () => {
        const err = new RouterError("ERR");

        // Test with null
        expect(() => {
          // @ts-expect-error - intentionally passing null
          err.setErrorInstance(null);
        }).toThrowError(TypeError);
        expect(() => {
          // @ts-expect-error - intentionally passing null
          err.setErrorInstance(null);
        }).toThrowError(
          "[RouterError.setErrorInstance] err parameter is required",
        );

        // Test with undefined
        expect(() => {
          // @ts-expect-error - intentionally passing undefined
          err.setErrorInstance(undefined);
        }).toThrowError(TypeError);
        expect(() => {
          // @ts-expect-error - intentionally passing undefined
          err.setErrorInstance(undefined);
        }).toThrowError(
          "[RouterError.setErrorInstance] err parameter is required",
        );
      });

      it("should handle Error without stack", () => {
        const err = new RouterError("ERR");
        const nativeErr = new Error("Native error");

        // Remove stack
        // @ts-expect-error - intentionally setting undefined
        nativeErr.stack = undefined;

        err.setErrorInstance(nativeErr);

        expect(err.message).toBe("Native error");
        expect(err.stack).toBe("");
      });

      it("should handle Error with very long stack trace", () => {
        const err = new RouterError("ERR");
        const nativeErr = new Error("Error");

        nativeErr.stack = `Error\n${"  at function ".repeat(1000)}`;

        err.setErrorInstance(nativeErr);

        expect(err.stack).toContain("Error");
        expect(err.stack!.length).toBeGreaterThan(10_000);
      });

      it("should handle Error with cause chain", () => {
        const err = new RouterError("ERR");
        const rootCause = new Error("Root cause");
        const middleCause = new Error("Middle cause", { cause: rootCause });
        const topError = new Error("Top error", { cause: middleCause });

        err.setErrorInstance(topError);

        expect(err.message).toBe("Top error");
        expect(err.cause).toBe(middleCause);
      });

      it("should handle multiple calls to setErrorInstance", () => {
        const err = new RouterError("ERR");

        err.setErrorInstance(new Error("First"));

        expect(err.message).toBe("First");

        err.setErrorInstance(new Error("Second"));

        expect(err.message).toBe("Second");

        err.setErrorInstance(new Error("Third"));

        expect(err.message).toBe("Third");
      });
    });

    describe("setAdditionalFields edge cases", () => {
      it("should protect methods from being overwritten", () => {
        const err = new RouterError("ERR");

        // Try to overwrite reserved method names
        err.setAdditionalFields({
          setCode: "not a function",
          toJSON: "not a function",
          hasField: 123,
          getField: "also not a function",
          setAdditionalFields: "nope",
          setErrorInstance: "blocked",
        });

        // Methods should NOT be overwritten (protected by reservedKeys filter)
        expect(typeof err.setCode).toBe("function");
        expect(typeof err.toJSON).toBe("function");
        expect(typeof err.hasField).toBe("function");
        expect(typeof err.getField).toBe("function");
        expect(typeof err.setAdditionalFields).toBe("function");
        expect(typeof err.setErrorInstance).toBe("function");

        // Verify methods still work correctly
        expect(err.hasField("code")).toBe(true);
        expect(err.toJSON()).toHaveProperty("code", "ERR");
      });

      it("should handle fields with same names as built-in fields", () => {
        const err = new RouterError("ERR", { message: "Original" });

        // message is public, so it can be overwritten
        err.setAdditionalFields({
          message: "Overwritten",
        });

        expect(err.message).toBe("Overwritten");

        // code is a getter (private #code), so attempting to set it throws an error
        expect(() => {
          err.setAdditionalFields({
            code: "Should not work",
          });
        }).toThrowError();

        // code should remain unchanged
        expect(err.code).toBe("ERR");
      });

      it("should handle nested objects", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({
          nested: {
            level1: {
              level2: {
                level3: "deep value",
              },
            },
          },
        });

        expect(err.nested).toStrictEqual({
          level1: {
            level2: {
              level3: "deep value",
            },
          },
        });
      });

      it("should handle arrays", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({
          items: [1, 2, 3],
          objects: [{ id: 1 }, { id: 2 }],
        });

        expect(err.items).toStrictEqual([1, 2, 3]);
        expect(err.objects).toStrictEqual([{ id: 1 }, { id: 2 }]);
      });

      it("should handle large number of fields", () => {
        const err = new RouterError("ERR");
        const fields: Record<string, number> = {};

        for (let i = 0; i < 1000; i++) {
          fields[`field${i}`] = i;
        }

        err.setAdditionalFields(fields);

        expect(err.field0).toBe(0);
        expect(err.field500).toBe(500);
        expect(err.field999).toBe(999);
      });

      it("should handle multiple calls accumulating fields", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({ a: 1 });
        err.setAdditionalFields({ b: 2 });
        err.setAdditionalFields({ c: 3 });

        expect(err.a).toBe(1);
        expect(err.b).toBe(2);
        expect(err.c).toBe(3);
      });

      it("should handle overwriting existing custom fields", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({ field: "original" });

        expect(err.field).toBe("original");

        err.setAdditionalFields({ field: "updated" });

        expect(err.field).toBe("updated");
      });
    });

    describe("toJSON edge cases", () => {
      it("should handle undefined values in custom fields", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({
          definedField: "value",
          undefinedField: undefined,
        });

        const json = err.toJSON();

        expect(json.definedField).toBe("value");
        // undefined is included in JSON
        expect("undefinedField" in json).toBe(true);
      });

      it("should exclude stack trace", () => {
        const err = new RouterError("ERR");

        err.stack = "Very long stack trace\n  at function1\n  at function2";

        const json = err.toJSON();

        expect(json.stack).toBeUndefined();
        expect(JSON.stringify(json)).not.toContain("stack trace");
      });

      it("should handle large number of custom fields efficiently", () => {
        const err = new RouterError("ERR");
        const fields: Record<string, number> = {};

        for (let i = 0; i < 100; i++) {
          fields[`field${i}`] = i;
        }

        err.setAdditionalFields(fields);

        const json = err.toJSON();

        expect(Object.keys(json).length).toBeGreaterThan(100); // code + message + 100 fields
        expect(json.field0).toBe(0);
        expect(json.field99).toBe(99);
      });

      it("should handle nested objects in custom fields", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({
          nested: {
            level1: {
              level2: "value",
            },
          },
        });

        const json = err.toJSON();

        expect(json.nested).toStrictEqual({
          level1: {
            level2: "value",
          },
        });
      });

      it("should handle arrays in custom fields", () => {
        const err = new RouterError("ERR");

        err.setAdditionalFields({
          items: [1, 2, 3],
          objects: [{ id: 1 }, { id: 2 }],
        });

        const json = err.toJSON();

        expect(json.items).toStrictEqual([1, 2, 3]);
        expect(json.objects).toStrictEqual([{ id: 1 }, { id: 2 }]);
      });

      it("should be JSON.stringify compatible", () => {
        const err = new RouterError("ERR", {
          message: "Test error",
          segment: "users",
        });

        err.setAdditionalFields({ userId: "123" });

        const jsonString = JSON.stringify(err);
        const parsed = JSON.parse(jsonString);

        expect(parsed.code).toBe("ERR");
        expect(parsed.message).toBe("Test error");
        expect(parsed.segment).toBe("users");
        expect(parsed.userId).toBe("123");
        expect(parsed.stack).toBeUndefined();
      });

      it("should exclude reserved fields from for...in loop via excludeKeys", () => {
        const err = new RouterError("ERR_CODE");

        // Add custom fields that will be iterated by for...in
        err.setAdditionalFields({
          customField1: "value1",
          customField2: "value2",
        });

        // Try to make stack enumerable (it's normally non-enumerable)
        Object.defineProperty(err, "stack", {
          value: "Fake stack trace",
          enumerable: true, // ← Make it enumerable!
          configurable: true,
          writable: true,
        });

        // Verify stack is now enumerable
        expect(Object.keys(err)).toContain("stack");

        const json = err.toJSON();

        // stack should STILL be excluded by excludeKeys Set, even though it's enumerable
        expect(json.stack).toBeUndefined();

        // But custom fields should be included
        expect(json.customField1).toBe("value1");
        expect(json.customField2).toBe("value2");

        // Core fields should be present (from explicit assignment, not from loop)
        expect(json.code).toBe("ERR_CODE");
        expect(json.message).toBe("ERR_CODE");

        // Verify the for...in loop protection
        // If excludeKeys didn't work, stack would be in json
        let stackFoundInLoop = false;

        for (const key in err) {
          if (key === "stack" && Object.hasOwn(err, key)) {
            stackFoundInLoop = true;
          }
        }

        // stack is enumerable and own, but excludeKeys prevents it from being added
        expect(stackFoundInLoop).toBe(true); // It IS in the loop
        expect(json.stack).toBeUndefined(); // But NOT in JSON (filtered by excludeKeys)
      });
    });
  });
});

describe("errorCodes", () => {
  it("should export error code constants", () => {
    expect(errorCodes.ROUTER_NOT_STARTED).toBe("NOT_STARTED");
    expect(errorCodes.ROUTE_NOT_FOUND).toBe("ROUTE_NOT_FOUND");
    expect(errorCodes.SAME_STATES).toBe("SAME_STATES");
  });

  it("should have all expected error codes", () => {
    const expectedCodes = [
      "ROUTER_NOT_STARTED",
      "NO_START_PATH_OR_STATE",
      "ROUTER_ALREADY_STARTED",
      "ROUTE_NOT_FOUND",
      "SAME_STATES",
      "CANNOT_DEACTIVATE",
      "CANNOT_ACTIVATE",
      "TRANSITION_ERR",
      "TRANSITION_CANCELLED",
    ];

    expectedCodes.forEach((code) => {
      expect(errorCodes).toHaveProperty(code);
    });
  });
});
