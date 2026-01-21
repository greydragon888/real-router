import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { createRouter } from "@real-router/core";

import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/options", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("getOptions", () => {
    it("should return updated value after setOption", () => {
      router.setOption("caseSensitive", true);

      router.start();

      expect(router.getOptions().caseSensitive).toBe(true);
    });

    // 🔴 CRITICAL: Performance - same frozen object every call
    it("should return the same frozen object on each call", () => {
      const opts1 = router.getOptions();
      const opts2 = router.getOptions();

      // Same frozen object (performance optimization)
      expect(opts1).toBe(opts2);
      // Object is frozen
      expect(Object.isFrozen(opts1)).toBe(true);
    });

    // 🔴 CRITICAL: Isolation - mutations throw TypeError
    it("should throw when attempting to mutate returned object", () => {
      const opts = router.getOptions();

      // Mutations should throw in strict mode (Vitest runs in strict mode)
      expect(() => {
        opts.caseSensitive = !opts.caseSensitive;
      }).toThrowError(TypeError);

      expect(() => {
        opts.allowNotFound = !opts.allowNotFound;
      }).toThrowError(TypeError);

      expect(() => {
        opts.trailingSlash = "always";
      }).toThrowError(TypeError);

      expect(() => {
        opts.defaultRoute = "mutated";
      }).toThrowError(TypeError);
    });

    // 🔴 CRITICAL: Nested objects are also frozen
    it("should freeze nested objects like queryParams and defaultParams", () => {
      const customRouter = createTestRouter({
        defaultParams: { id: "123" },
        queryParams: { arrayFormat: "brackets" },
      });

      const opts = customRouter.getOptions();

      // Nested objects should also be frozen
      expect(Object.isFrozen(opts.queryParams)).toBe(true);
      expect(Object.isFrozen(opts.defaultParams)).toBe(true);

      // Mutations to nested objects should throw
      expect(() => {
        opts.queryParams!.arrayFormat = "comma";
      }).toThrowError(TypeError);

      expect(() => {
        opts.defaultParams.id = "456";
      }).toThrowError(TypeError);

      customRouter.stop();
    });

    // 🔴 CRITICAL: Default values
    it("should return all options with default values when no custom options provided", () => {
      const opts = router.getOptions();

      // Check all required fields exist
      expect(opts).toHaveProperty("trailingSlash");
      expect(opts).toHaveProperty("queryParamsMode");
      expect(opts).toHaveProperty("caseSensitive");
      expect(opts).toHaveProperty("urlParamsEncoding");
      expect(opts).toHaveProperty("allowNotFound");
      expect(opts).toHaveProperty("rewritePathOnMatch");

      // Check default values
      expect(opts.trailingSlash).toBe("preserve");
      expect(opts.queryParamsMode).toBe("loose");
      expect(opts.caseSensitive).toBe(false);
      expect(opts.urlParamsEncoding).toBe("default");
      expect(opts.allowNotFound).toBe(true);
      expect(opts.rewritePathOnMatch).toBe(true);
    });

    // 🟡 IMPORTANT: Works before start()
    it("should work before router.start()", () => {
      const opts = router.getOptions();

      expect(opts).toBeDefined();
      expect(opts.caseSensitive).toBe(false);
    });

    // 🟡 IMPORTANT: Works after start()
    it("should work after router.start()", () => {
      router.start();

      const opts = router.getOptions();

      expect(opts).toBeDefined();
      expect(opts.caseSensitive).toBe(false);
    });

    // 🟡 IMPORTANT: Reflects custom options from constructor
    it("should return custom options provided during router creation", () => {
      const customRouter = createTestRouter({
        caseSensitive: true,
        trailingSlash: "always",
        allowNotFound: false,
        defaultRoute: "dashboard",
        defaultParams: { id: "123" },
      });

      const opts = customRouter.getOptions();

      expect(opts.caseSensitive).toBe(true);
      expect(opts.trailingSlash).toBe("always");
      expect(opts.allowNotFound).toBe(false);
      expect(opts.defaultRoute).toBe("dashboard");
      expect(opts.defaultParams).toStrictEqual({ id: "123" });

      customRouter.stop();
    });

    // 🟡 IMPORTANT: Returns default values for optional fields when not set
    it("should return default values for optional fields when not set", () => {
      // Create router without custom options
      const plainRouter = createRouter([{ name: "test", path: "/test" }]);
      const opts = plainRouter.getOptions();

      // Optional fields have defaults, not undefined
      expect(opts.defaultRoute).toBe("");
      expect(opts.defaultParams).toStrictEqual({});
      expect(opts.queryParams).toStrictEqual({
        arrayFormat: "none",
        booleanFormat: "none",
        nullFormat: "default",
      });

      plainRouter.stop();
    });

    // 🟢 DESIRABLE: Multiple sequential calls return same frozen object
    it("should handle multiple sequential calls correctly", () => {
      const calls = Array.from({ length: 5 }, () => router.getOptions());

      // All same frozen object (performance optimization)
      for (let i = 0; i < calls.length; i++) {
        for (let j = i + 1; j < calls.length; j++) {
          expect(calls[i]).toBe(calls[j]);
        }
      }

      // All frozen
      calls.forEach((opts) => {
        expect(Object.isFrozen(opts)).toBe(true);
      });
    });

    // 🟢 DESIRABLE: Integration with setOption
    it("should reflect all changes made through setOption", () => {
      router.setOption("caseSensitive", true);
      router.setOption("trailingSlash", "never");
      router.setOption("allowNotFound", false);
      router.setOption("defaultRoute", "dashboard");

      const opts = router.getOptions();

      expect(opts.caseSensitive).toBe(true);
      expect(opts.trailingSlash).toBe("never");
      expect(opts.allowNotFound).toBe(false);
      expect(opts.defaultRoute).toBe("dashboard");
    });

    // 🟢 DESIRABLE: Shallow copy is sufficient
    it("should handle all option types correctly (primitives)", () => {
      router.setOption("caseSensitive", true); // boolean
      router.setOption("trailingSlash", "always"); // string
      router.setOption("defaultRoute", "home"); // string | undefined
      router.setOption("defaultParams", { id: "123" }); // object

      const opts = router.getOptions();

      expectTypeOf(opts.caseSensitive).toBeBoolean();
      expectTypeOf(opts.trailingSlash).toBeString();

      expect(opts.defaultRoute).toBe("home");
      expect(opts.defaultParams).toStrictEqual({ id: "123" });
    });
  });

  describe("setOption", () => {
    it("should update a specific option", () => {
      router.setOption("allowNotFound", true);

      router.start();

      expect(router.getOptions().allowNotFound).toBe(true);
    });

    it("should override default options", () => {
      router.setOption("trailingSlash", "always");

      router.start();

      expect(router.getOptions().trailingSlash).toBe("always");
    });

    // 🔴 CRITICAL: Block changes after start()
    describe("blocking after start()", () => {
      it("should throw error when setting option after start()", () => {
        router.start();

        expect(() => router.setOption("caseSensitive", true)).toThrowError(
          "Options cannot be changed after router.start()",
        );
      });

      it("should throw error even when setting same value after start()", () => {
        const currentValue = router.getOptions().allowNotFound;

        router.start();

        expect(() =>
          router.setOption("allowNotFound", currentValue),
        ).toThrowError("Options cannot be changed after router.start()");
      });

      it("should throw error for any option type after start()", () => {
        router.start();

        // These options should throw after start()
        expect(() => router.setOption("caseSensitive", false)).toThrowError();
        expect(() => router.setOption("trailingSlash", "never")).toThrowError();
        expect(() => router.setOption("allowNotFound", false)).toThrowError();
        expect(() =>
          router.setOption("urlParamsEncoding", "uri"),
        ).toThrowError();
        expect(() =>
          router.setOption("queryParams", { arrayFormat: "bracket" }),
        ).toThrowError();
      });

      it("should allow changing defaultRoute and defaultParams after start()", () => {
        router.start();

        // These two options are special - they CAN be changed after start()
        expect(() =>
          router.setOption("defaultRoute", "home"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("defaultParams", { id: "1" }),
        ).not.toThrowError();

        expect(router.getOptions().defaultRoute).toBe("home");
        expect(router.getOptions().defaultParams).toStrictEqual({ id: "1" });
      });
    });

    // 🔴 CRITICAL: Type validation
    describe("type validation", () => {
      it("should throw TypeError for wrong primitive type - boolean", () => {
        expect(() =>
          router.setOption("caseSensitive", "true" as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("caseSensitive", "true" as any),
        ).toThrowError("expected boolean, got string");
      });

      it("should throw TypeError for wrong primitive type - string", () => {
        expect(() =>
          router.setOption("trailingSlash", true as any),
        ).toThrowError(TypeError);
        expect(() => router.setOption("defaultRoute", 123 as any)).toThrowError(
          TypeError,
        );
      });

      it("should throw TypeError for undefined value", () => {
        expect(() =>
          router.setOption("caseSensitive", undefined as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("trailingSlash", undefined as any),
        ).toThrowError(TypeError);
      });

      it("should throw TypeError for null value", () => {
        expect(() =>
          router.setOption("caseSensitive", null as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("defaultRoute", null as any),
        ).toThrowError(TypeError);
      });
    });

    // 🔴 CRITICAL: Enum validation for string options
    describe("enum validation", () => {
      it("should throw TypeError for invalid trailingSlash value", () => {
        expect(() =>
          router.setOption("trailingSlash", "INVALID" as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("trailingSlash", "INVALID" as any),
        ).toThrowError(
          'expected one of "strict", "never", "always", "preserve"',
        );
      });

      it("should throw TypeError for invalid queryParamsMode value", () => {
        expect(() =>
          router.setOption("queryParamsMode", "INVALID" as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("queryParamsMode", "INVALID" as any),
        ).toThrowError('expected one of "default", "strict", "loose"');
      });

      it("should throw TypeError for invalid urlParamsEncoding value", () => {
        expect(() =>
          router.setOption("urlParamsEncoding", "INVALID" as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("urlParamsEncoding", "INVALID" as any),
        ).toThrowError(
          'expected one of "default", "uri", "uriComponent", "none"',
        );
      });

      it("should accept all valid trailingSlash values", () => {
        expect(() =>
          router.setOption("trailingSlash", "strict"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("trailingSlash", "never"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("trailingSlash", "always"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("trailingSlash", "preserve"),
        ).not.toThrowError();
      });

      it("should accept all valid queryParamsMode values", () => {
        expect(() =>
          router.setOption("queryParamsMode", "default"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("queryParamsMode", "strict"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("queryParamsMode", "loose"),
        ).not.toThrowError();
      });

      it("should accept all valid urlParamsEncoding values", () => {
        expect(() =>
          router.setOption("urlParamsEncoding", "default"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("urlParamsEncoding", "uri"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("urlParamsEncoding", "uriComponent"),
        ).not.toThrowError();
        expect(() =>
          router.setOption("urlParamsEncoding", "none"),
        ).not.toThrowError();
      });

      it("should include invalid value in error message", () => {
        expect(() =>
          router.setOption("trailingSlash", "typo-value" as any),
        ).toThrowError('got "typo-value"');
      });
    });

    // 🔴 CRITICAL: Object validation
    describe("object validation", () => {
      it("should reject array for object options", () => {
        expect(() => router.setOption("queryParams", [] as any)).toThrowError(
          TypeError,
        );
        expect(() => router.setOption("queryParams", [] as any)).toThrowError(
          "expected plain object",
        );

        expect(() => router.setOption("defaultParams", [] as any)).toThrowError(
          TypeError,
        );
      });

      it("should reject Date instance for object options", () => {
        expect(() =>
          router.setOption("queryParams", new Date() as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("defaultParams", new Date() as any),
        ).toThrowError(TypeError);
      });

      it("should reject null for object options", () => {
        expect(() => router.setOption("queryParams", null as any)).toThrowError(
          TypeError,
        );
        expect(() =>
          router.setOption("defaultParams", null as any),
        ).toThrowError(TypeError);
      });

      it("should reject class instances for object options", () => {
        class CustomClass {
          value = "test";
        }
        const instance = new CustomClass();

        expect(() =>
          router.setOption("queryParams", instance as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("defaultParams", instance as any),
        ).toThrowError(TypeError);
      });

      it("should reject Object.create(null) for object options", () => {
        const nullProto = Object.create(null);

        expect(() => router.setOption("queryParams", nullProto)).toThrowError(
          TypeError,
        );
        expect(() => router.setOption("defaultParams", nullProto)).toThrowError(
          TypeError,
        );
      });

      it("should accept plain objects for object options", () => {
        expect(() => router.setOption("queryParams", {})).not.toThrowError();
        expect(() =>
          router.setOption("queryParams", { arrayFormat: "brackets" }),
        ).not.toThrowError();
        expect(() => router.setOption("defaultParams", {})).not.toThrowError();
        expect(() =>
          router.setOption("defaultParams", { id: "123" }),
        ).not.toThrowError();
      });

      it("should reject objects with getters", () => {
        const withGetter = {
          get id() {
            return "123";
          },
        };

        expect(() =>
          router.setOption("defaultParams", withGetter),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("defaultParams", withGetter),
        ).toThrowError('Getters not allowed in "defaultParams": "id"');
      });

      it("should reject objects with getters in queryParams", () => {
        const withGetter = {
          get arrayFormat() {
            return "bracket";
          },
        };

        expect(() => router.setOption("queryParams", withGetter)).toThrowError(
          TypeError,
        );
        expect(() => router.setOption("queryParams", withGetter)).toThrowError(
          "Getters not allowed",
        );
      });

      it("should accept objects with regular properties alongside rejected getters", () => {
        const mixed = {
          normalProp: "value",
          get dangerousProp() {
            return "danger";
          },
        };

        expect(() => router.setOption("defaultParams", mixed)).toThrowError(
          TypeError,
        );
        expect(() => router.setOption("defaultParams", mixed)).toThrowError(
          'Getters not allowed in "defaultParams": "dangerousProp"',
        );
      });

      // 🔴 CRITICAL: queryParams key validation
      it("should reject unknown keys in queryParams", () => {
        expect(() =>
          router.setOption("queryParams", { unknownKey: "value" } as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("queryParams", { unknownKey: "value" } as any),
        ).toThrowError('Unknown queryParams key: "unknownKey"');
      });

      // 🔴 CRITICAL: queryParams value validation
      it("should reject invalid arrayFormat value", () => {
        expect(() =>
          router.setOption("queryParams", { arrayFormat: "invalid" } as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("queryParams", { arrayFormat: "invalid" } as any),
        ).toThrowError('expected one of "none", "brackets", "index", "comma"');
      });

      it("should reject invalid booleanFormat value", () => {
        expect(() =>
          router.setOption("queryParams", { booleanFormat: "wrong" } as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("queryParams", { booleanFormat: "wrong" } as any),
        ).toThrowError('expected one of "none", "string", "empty-true"');
      });

      it("should reject invalid nullFormat value", () => {
        expect(() =>
          router.setOption("queryParams", { nullFormat: "bad" } as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("queryParams", { nullFormat: "bad" } as any),
        ).toThrowError('expected one of "default", "hidden"');
      });

      it("should accept all valid queryParams combinations", () => {
        expect(() =>
          router.setOption("queryParams", {
            arrayFormat: "none",
            booleanFormat: "none",
            nullFormat: "default",
          }),
        ).not.toThrowError();

        expect(() =>
          router.setOption("queryParams", {
            arrayFormat: "brackets",
            booleanFormat: "string",
            nullFormat: "hidden",
          }),
        ).not.toThrowError();

        expect(() =>
          router.setOption("queryParams", {
            arrayFormat: "index",
            booleanFormat: "empty-true",
          }),
        ).not.toThrowError();

        expect(() =>
          router.setOption("queryParams", { arrayFormat: "comma" }),
        ).not.toThrowError();
      });
    });

    // 🔴 CRITICAL: Non-existent option
    describe("non-existent options", () => {
      it("should throw ReferenceError for unknown option name", () => {
        expect(() =>
          router.setOption("unknownOption" as any, true),
        ).toThrowError(ReferenceError);
        expect(() =>
          router.setOption("unknownOption" as any, true),
        ).toThrowError('option "unknownOption" not found');
      });

      it("should throw ReferenceError for typo in option name", () => {
        expect(() =>
          router.setOption("caseSensitve" as any, true),
        ).toThrowError(ReferenceError);
        expect(() =>
          router.setOption("trailingslash" as any, "never"),
        ).toThrowError(ReferenceError);
      });

      it("should protect against TypeScript bypass with runtime checks", () => {
        const malformed: any = { name: "nonExistent", value: 123 };

        expect(() =>
          router.setOption(malformed.name, malformed.value),
        ).toThrowError(ReferenceError);
        expect(() =>
          router.setOption(malformed.name, malformed.value),
        ).toThrowError('option "nonExistent" not found');
      });

      it("should reject prototype pollution keys", () => {
        const dangerousKeys = [
          "__proto__",
          "constructor",
          "hasOwnProperty",
          "toString",
          "prototype",
        ];

        for (const key of dangerousKeys) {
          expect(() =>
            // @ts-expect-error: testing prototype pollution
            router.setOption(key, {}),
          ).toThrowError(ReferenceError);
          expect(() =>
            // @ts-expect-error: testing prototype pollution
            router.setOption(key, {}),
          ).toThrowError(`option "${key}" not found`);
        }
      });
    });

    // 🔴 CRITICAL: optionName type validation
    describe("optionName type validation", () => {
      it("should throw TypeError for number as optionName", () => {
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(123, true),
        ).toThrowError(TypeError);
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(123, true),
        ).toThrowError("option name must be a string, got number");
      });

      it("should throw TypeError for object with toString as optionName", () => {
        const fakeKey = { toString: () => "caseSensitive" };

        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(fakeKey, true),
        ).toThrowError(TypeError);
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(fakeKey, true),
        ).toThrowError("option name must be a string, got object");
      });

      it("should throw TypeError for Symbol as optionName", () => {
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(Symbol("caseSensitive"), true),
        ).toThrowError(TypeError);
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(Symbol("caseSensitive"), true),
        ).toThrowError("option name must be a string, got symbol");
      });

      it("should throw TypeError for null as optionName", () => {
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(null, true),
        ).toThrowError(TypeError);
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(null, true),
        ).toThrowError("option name must be a string, got object");
      });

      it("should throw TypeError for undefined as optionName", () => {
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(undefined, true),
        ).toThrowError(TypeError);
        expect(() =>
          // @ts-expect-error: testing invalid input
          router.setOption(undefined, true),
        ).toThrowError("option name must be a string, got undefined");
      });
    });

    // 🟡 IMPORTANT: Fluent interface
    describe("fluent interface", () => {
      it("should return router instance for chaining", () => {
        const result = router.setOption("caseSensitive", true);

        expect(result).toBe(router);
      });

      it("should support method chaining", () => {
        const result = router
          .setOption("caseSensitive", true)
          .setOption("trailingSlash", "never")
          .setOption("allowNotFound", false)
          .setOption("defaultRoute", "home");

        expect(result).toBe(router);
        expect(router.getOptions().caseSensitive).toBe(true);
        expect(router.getOptions().trailingSlash).toBe("never");
        expect(router.getOptions().allowNotFound).toBe(false);
        expect(router.getOptions().defaultRoute).toBe("home");
      });

      it("should allow chaining with start()", () => {
        router
          .setOption("caseSensitive", true)
          .setOption("trailingSlash", "always")
          .start();

        expect(router.isStarted()).toBe(true);
        expect(router.getOptions().caseSensitive).toBe(true);
        expect(router.getOptions().trailingSlash).toBe("always");
      });
    });

    // 🟢 DESIRABLE: Idempotence
    describe("idempotence", () => {
      it("should allow setting same value multiple times", () => {
        router.setOption("caseSensitive", true);
        router.setOption("caseSensitive", true);
        router.setOption("caseSensitive", true);

        expect(router.getOptions().caseSensitive).toBe(true);
      });

      it("should allow toggling values", () => {
        router.setOption("caseSensitive", true);

        expect(router.getOptions().caseSensitive).toBe(true);

        router.setOption("caseSensitive", false);

        expect(router.getOptions().caseSensitive).toBe(false);

        router.setOption("caseSensitive", true);

        expect(router.getOptions().caseSensitive).toBe(true);
      });
    });

    // 🟢 DESIRABLE: Edge cases
    describe("edge cases", () => {
      it("should accept empty string for defaultRoute", () => {
        expect(() => router.setOption("defaultRoute", "")).not.toThrowError();
        expect(router.getOptions().defaultRoute).toBe("");
      });

      it("should accept empty object for queryParams", () => {
        expect(() => router.setOption("queryParams", {})).not.toThrowError();
        expect(router.getOptions().queryParams).toStrictEqual({});
      });

      it("should accept empty object for defaultParams", () => {
        expect(() => router.setOption("defaultParams", {})).not.toThrowError();
        expect(router.getOptions().defaultParams).toStrictEqual({});
      });

      // Edge Case #4: Objects with throwing toString/valueOf are safely rejected
      it("should safely reject object with throwing toString for string option", () => {
        const evilValue = {
          toString() {
            throw new Error("toString bomb");
          },
          valueOf() {
            throw new Error("valueOf bomb");
          },
        };

        // typeof check happens before any coercion
        expect(() =>
          router.setOption("defaultRoute", evilValue as any),
        ).toThrowError(TypeError);
        expect(() =>
          router.setOption("defaultRoute", evilValue as any),
        ).toThrowError("expected string, got object");
      });

      // Edge Case #8: Truthy/falsy values should be rejected for boolean options
      it("should reject number 1 for boolean option", () => {
        expect(() => router.setOption("caseSensitive", 1 as any)).toThrowError(
          TypeError,
        );
        expect(() => router.setOption("caseSensitive", 1 as any)).toThrowError(
          "expected boolean, got number",
        );
      });

      it("should reject number 0 for boolean option", () => {
        expect(() => router.setOption("caseSensitive", 0 as any)).toThrowError(
          TypeError,
        );
        expect(() => router.setOption("caseSensitive", 0 as any)).toThrowError(
          "expected boolean, got number",
        );
      });

      // Edge Case #9: Frozen/sealed objects should be accepted
      it("should accept frozen object for defaultParams", () => {
        const frozenParams = Object.freeze({ id: "123" });

        expect(() =>
          router.setOption("defaultParams", frozenParams),
        ).not.toThrowError();
        expect(router.getOptions().defaultParams).toStrictEqual({ id: "123" });
      });

      it("should accept sealed object for defaultParams", () => {
        const sealedParams = Object.seal({ id: "456" });

        expect(() =>
          router.setOption("defaultParams", sealedParams),
        ).not.toThrowError();
        expect(router.getOptions().defaultParams).toStrictEqual({ id: "456" });
      });

      // Edge Case #10: Multiple rapid calls - last one wins
      it("should handle multiple rapid calls correctly", () => {
        for (let i = 0; i < 100; i++) {
          router.setOption("defaultRoute", `route-${i}`);
        }

        expect(router.getOptions().defaultRoute).toBe("route-99");
      });
    });

    // 🟡 IMPORTANT: Integration - effect on buildPath
    describe("integration with buildPath", () => {
      it("should apply trailingSlash option to buildPath", () => {
        router.setOption("trailingSlash", "always");
        router.start();

        const path = router.buildPath("users.view", { id: "123" });

        expect(path).toMatch(/\/$/); // ends with /
      });

      it("should apply trailingSlash 'never' option to buildPath", () => {
        router.setOption("trailingSlash", "never");
        router.start();

        const path = router.buildPath("users.view", { id: "123" });

        expect(path).not.toMatch(/\/$/); // doesn't end with /
      });

      it("should apply urlParamsEncoding option to buildPath", () => {
        router.setOption("urlParamsEncoding", "uriComponent");
        router.start();

        const path = router.buildPath("users.view", { id: "hello world" });

        expect(path).toContain("hello%20world");
      });
    });

    // 🟡 IMPORTANT: Integration - effect on matchPath
    describe("integration with matchPath", () => {
      it("should apply caseSensitive option to matchPath", () => {
        router.setOption("caseSensitive", true);
        router.start();

        // Route is defined as 'users.view' with path '/users/view/:id'
        const matchLower = router.matchPath("/users/view/123");
        const matchUpper = router.matchPath("/Users/View/123");

        expect(matchLower).toBeDefined();
        expect(matchUpper).toBeUndefined(); // case doesn't match
      });

      it("should ignore case when caseSensitive is false", () => {
        router.setOption("caseSensitive", false);
        router.start();

        const matchLower = router.matchPath("/users/view/123");
        const matchUpper = router.matchPath("/Users/View/123");

        expect(matchLower).toBeDefined();
        expect(matchUpper).toBeDefined(); // case is ignored
      });

      it("should apply trailingSlash option to matchPath", () => {
        router.setOption("trailingSlash", "strict");
        router.start();

        // Route 'users.list' is defined as '/users/list' without trailing slash
        const withoutSlash = router.matchPath("/users/list");
        const withSlash = router.matchPath("/users/list/");

        // In strict mode, trailing slash matters
        expect(withoutSlash).toBeDefined();
        expect(withSlash).toBeUndefined();
      });
    });
  });

  describe("options.ts edge cases (lines 31, 73, 79)", () => {
    it("should throw TypeError for unknown option in createRouter (line 73)", () => {
      expect(() =>
        createRouter([], { unknownOption: "value" } as any),
      ).toThrowError(TypeError);
      expect(() =>
        createRouter([], { unknownOption: "value" } as any),
      ).toThrowError('Unknown option: "unknownOption"');
    });

    it("should skip undefined values during initialization (line 79)", () => {
      // Should not throw when option value is undefined
      expect(() =>
        createRouter([], {
          defaultRoute: "home",
          caseSensitive: undefined,
        } as any),
      ).not.toThrowError();

      const testRouter = createRouter([], {
        defaultRoute: "home",
        caseSensitive: undefined,
      } as any);

      // caseSensitive should not be set (undefined skip)
      // The option may remain undefined or keep default
      expect(testRouter.getOptions().defaultRoute).toBe("home");
    });
  });
});
