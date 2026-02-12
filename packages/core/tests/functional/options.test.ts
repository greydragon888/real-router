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
import type { Options } from "@real-router/types";

let router: Router;

describe("core/options", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("getOptions", () => {
    it("should return constructor-provided value", () => {
      const customRouter = createTestRouter({ trailingSlash: "always" });

      expect(customRouter.getOptions().trailingSlash).toBe("always");

      customRouter.stop();
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
        (opts.defaultParams as Record<string, unknown>).id = "456";
      }).toThrowError(TypeError);

      customRouter.stop();
    });

    // 🔴 CRITICAL: Default values
    it("should return all options with default values when no custom options provided", () => {
      const opts = router.getOptions();

      // Check all required fields exist
      expect(opts).toHaveProperty("trailingSlash");
      expect(opts).toHaveProperty("queryParamsMode");
      expect(opts).toHaveProperty("urlParamsEncoding");
      expect(opts).toHaveProperty("allowNotFound");
      expect(opts).toHaveProperty("rewritePathOnMatch");

      // Check default values
      expect(opts.trailingSlash).toBe("preserve");
      expect(opts.queryParamsMode).toBe("loose");
      expect(opts.urlParamsEncoding).toBe("default");
      expect(opts.allowNotFound).toBe(true);
      expect(opts.rewritePathOnMatch).toBe(true);
    });

    // 🟡 IMPORTANT: Works before start()
    it("should work before router.start()", () => {
      const opts = router.getOptions();

      expect(opts).toBeDefined();
      expect(opts.trailingSlash).toBe("preserve");
    });

    // 🟡 IMPORTANT: Works after start()
    it("should work after router.start()", () => {
      router.start();

      const opts = router.getOptions();

      expect(opts).toBeDefined();
      expect(opts.trailingSlash).toBe("preserve");
    });

    // 🟡 IMPORTANT: Reflects custom options from constructor
    it("should return custom options provided during router creation", () => {
      const customRouter = createTestRouter({
        trailingSlash: "always",
        allowNotFound: false,
        defaultRoute: "dashboard",
        defaultParams: { id: "123" },
      });

      const opts = customRouter.getOptions();

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

    // 🟢 DESIRABLE: Reflects multiple constructor options
    it("should reflect all options set via constructor", () => {
      const customRouter = createTestRouter({
        trailingSlash: "never",
        allowNotFound: false,
      });

      const opts = customRouter.getOptions();

      expect(opts.trailingSlash).toBe("never");
      expect(opts.allowNotFound).toBe(false);

      customRouter.stop();
    });

    // 🟢 DESIRABLE: All option types are correct
    it("should handle all option types correctly (primitives)", () => {
      const customRouter = createTestRouter({
        trailingSlash: "always",
        defaultRoute: "home",
        defaultParams: { id: "123" },
      });

      const opts = customRouter.getOptions();

      expectTypeOf(opts.trailingSlash).toBeString();

      expect(opts.defaultRoute).toBe("home");
      expect(opts.defaultParams).toStrictEqual({ id: "123" });

      customRouter.stop();
    });
  });

  describe("constructor validation", () => {
    // 🔴 CRITICAL: Type validation
    describe("type validation", () => {
      it("should throw TypeError for wrong primitive type - string", () => {
        expect(() =>
          createRouter([], { trailingSlash: true as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { defaultRoute: 123 as any }),
        ).toThrowError(TypeError);
      });

      it("should throw TypeError for null value", () => {
        expect(() =>
          createRouter([], { defaultRoute: null as any }),
        ).toThrowError(TypeError);
      });
    });

    // 🔴 CRITICAL: Enum validation for string options
    describe("enum validation", () => {
      it("should throw TypeError for invalid trailingSlash value", () => {
        expect(() =>
          createRouter([], { trailingSlash: "INVALID" as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { trailingSlash: "INVALID" as any }),
        ).toThrowError(
          'expected one of "strict", "never", "always", "preserve"',
        );
      });

      it("should throw TypeError for invalid queryParamsMode value", () => {
        expect(() =>
          createRouter([], { queryParamsMode: "INVALID" as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { queryParamsMode: "INVALID" as any }),
        ).toThrowError('expected one of "default", "strict", "loose"');
      });

      it("should throw TypeError for invalid urlParamsEncoding value", () => {
        expect(() =>
          createRouter([], { urlParamsEncoding: "INVALID" as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { urlParamsEncoding: "INVALID" as any }),
        ).toThrowError(
          'expected one of "default", "uri", "uriComponent", "none"',
        );
      });

      it("should accept all valid trailingSlash values", () => {
        for (const value of [
          "strict",
          "never",
          "always",
          "preserve",
        ] as const) {
          expect(() =>
            createRouter([], { trailingSlash: value }),
          ).not.toThrowError();
        }
      });

      it("should accept all valid queryParamsMode values", () => {
        for (const value of ["default", "strict", "loose"] as const) {
          expect(() =>
            createRouter([], { queryParamsMode: value }),
          ).not.toThrowError();
        }
      });

      it("should accept all valid urlParamsEncoding values", () => {
        for (const value of [
          "default",
          "uri",
          "uriComponent",
          "none",
        ] as const) {
          expect(() =>
            createRouter([], { urlParamsEncoding: value }),
          ).not.toThrowError();
        }
      });

      it("should include invalid value in error message", () => {
        expect(() =>
          createRouter([], { trailingSlash: "typo-value" as any }),
        ).toThrowError('got "typo-value"');
      });
    });

    // 🔴 CRITICAL: Object validation
    describe("object validation", () => {
      it("should reject array for object options", () => {
        expect(() => createRouter([], { queryParams: [] as any })).toThrowError(
          TypeError,
        );
        expect(() => createRouter([], { queryParams: [] as any })).toThrowError(
          "expected plain object",
        );

        expect(() =>
          createRouter([], { defaultParams: [] as any }),
        ).toThrowError(TypeError);
      });

      it("should reject Date instance for object options", () => {
        expect(() =>
          createRouter([], { queryParams: new Date() as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { defaultParams: new Date() as any }),
        ).toThrowError(TypeError);
      });

      it("should reject null for object options", () => {
        expect(() =>
          createRouter([], { queryParams: null as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { defaultParams: null as any }),
        ).toThrowError(TypeError);
      });

      it("should reject class instances for object options", () => {
        class CustomClass {
          value = "test";
        }
        const instance = new CustomClass();

        expect(() =>
          createRouter([], { queryParams: instance as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { defaultParams: instance as any }),
        ).toThrowError(TypeError);
      });

      it("should reject Object.create(null) for object options", () => {
        const nullProto = Object.create(null);

        expect(() => createRouter([], { queryParams: nullProto })).toThrowError(
          TypeError,
        );
        expect(() =>
          createRouter([], { defaultParams: nullProto }),
        ).toThrowError(TypeError);
      });

      it("should accept plain objects for object options", () => {
        expect(() => createRouter([], { queryParams: {} })).not.toThrowError();
        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "brackets" } }),
        ).not.toThrowError();
        expect(() =>
          createRouter([], { defaultParams: {} }),
        ).not.toThrowError();
        expect(() =>
          createRouter([], { defaultParams: { id: "123" } }),
        ).not.toThrowError();
      });

      it("should reject objects with getters", () => {
        const withGetter = {
          get id() {
            return "123";
          },
        };

        expect(() =>
          createRouter([], { defaultParams: withGetter }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { defaultParams: withGetter }),
        ).toThrowError('Getters not allowed in "defaultParams": "id"');
      });

      it("should reject objects with getters in queryParams", () => {
        const withGetter = {
          get arrayFormat() {
            return "bracket";
          },
        } as const;

        expect(() =>
          createRouter([], { queryParams: withGetter as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { queryParams: withGetter as any }),
        ).toThrowError("Getters not allowed");
      });

      it("should accept objects with regular properties alongside rejected getters", () => {
        const mixed = {
          normalProp: "value",
          get dangerousProp() {
            return "danger";
          },
        };

        expect(() => createRouter([], { defaultParams: mixed })).toThrowError(
          TypeError,
        );
        expect(() => createRouter([], { defaultParams: mixed })).toThrowError(
          'Getters not allowed in "defaultParams": "dangerousProp"',
        );
      });

      // 🔴 CRITICAL: queryParams key validation
      it("should reject unknown keys in queryParams", () => {
        expect(() =>
          createRouter([], { queryParams: { unknownKey: "value" } as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { queryParams: { unknownKey: "value" } as any }),
        ).toThrowError('Unknown queryParams key: "unknownKey"');
      });

      // 🔴 CRITICAL: queryParams value validation
      it("should reject invalid arrayFormat value", () => {
        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "invalid" } as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "invalid" } as any }),
        ).toThrowError('expected one of "none", "brackets", "index", "comma"');
      });

      it("should reject invalid booleanFormat value", () => {
        expect(() =>
          createRouter([], { queryParams: { booleanFormat: "wrong" } as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { queryParams: { booleanFormat: "wrong" } as any }),
        ).toThrowError('expected one of "none", "string", "empty-true"');
      });

      it("should reject invalid nullFormat value", () => {
        expect(() =>
          createRouter([], { queryParams: { nullFormat: "bad" } as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { queryParams: { nullFormat: "bad" } as any }),
        ).toThrowError('expected one of "default", "hidden"');
      });

      it("should accept all valid queryParams combinations", () => {
        expect(() =>
          createRouter([], {
            queryParams: {
              arrayFormat: "none",
              booleanFormat: "none",
              nullFormat: "default",
            },
          }),
        ).not.toThrowError();

        expect(() =>
          createRouter([], {
            queryParams: {
              arrayFormat: "brackets",
              booleanFormat: "string",
              nullFormat: "hidden",
            },
          }),
        ).not.toThrowError();

        expect(() =>
          createRouter([], {
            queryParams: {
              arrayFormat: "index",
              booleanFormat: "empty-true",
            },
          }),
        ).not.toThrowError();

        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "comma" } }),
        ).not.toThrowError();
      });
    });

    // 🔴 CRITICAL: Non-existent option
    describe("non-existent options", () => {
      it("should throw TypeError for unknown option name", () => {
        expect(() =>
          createRouter([], { unknownOption: true } as any),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { unknownOption: true } as any),
        ).toThrowError('Unknown option: "unknownOption"');
      });

      it("should reject prototype pollution keys", () => {
        // constructor is caught by the "expected plain object" check
        // Other keys are caught by the "Unknown option" check
        // __proto__ is safe: isObjKey uses `in` operator which finds it
        // in defaultOptions prototype chain, so it's treated as known
        // and its value is ignored in the options spread
        const dangerousKeys = [
          "constructor",
          "hasOwnProperty",
          "toString",
          "prototype",
        ];

        for (const key of dangerousKeys) {
          expect(() => createRouter([], { [key]: {} } as any)).toThrowError();
        }
      });
    });

    // 🟢 DESIRABLE: Edge cases
    describe("edge cases", () => {
      it("should accept empty string for defaultRoute", () => {
        const r = createRouter([], { defaultRoute: "" });

        expect(r.getOptions().defaultRoute).toBe("");
      });

      it("should accept empty object for queryParams", () => {
        const r = createRouter([], { queryParams: {} });

        expect(r.getOptions().queryParams).toStrictEqual({});
      });

      it("should accept empty object for defaultParams", () => {
        const r = createRouter([], { defaultParams: {} });

        expect(r.getOptions().defaultParams).toStrictEqual({});
      });

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
          createRouter([], { defaultRoute: evilValue as any }),
        ).toThrowError(TypeError);
        expect(() =>
          createRouter([], { defaultRoute: evilValue as any }),
        ).toThrowError("expected string, got object");
      });

      it("should reject number for string option", () => {
        expect(() =>
          createRouter([], { trailingSlash: 1 as any }),
        ).toThrowError(TypeError);
      });

      it("should accept frozen object for defaultParams", () => {
        const frozenParams = Object.freeze({ id: "123" });
        const r = createRouter([], { defaultParams: frozenParams });

        expect(r.getOptions().defaultParams).toStrictEqual({ id: "123" });
      });

      it("should accept sealed object for defaultParams", () => {
        const sealedParams = Object.seal({ id: "456" });
        const r = createRouter([], { defaultParams: sealedParams });

        expect(r.getOptions().defaultParams).toStrictEqual({ id: "456" });
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

    it("should throw TypeError for array as options in createRouter (line 194)", () => {
      expect(() => createRouter([], [] as any)).toThrowError(TypeError);
      expect(() => createRouter([], [] as any)).toThrowError(
        "Invalid options: expected plain object, got array",
      );
    });

    it("should throw TypeError for class instance as options in createRouter (line 194)", () => {
      class CustomOptions {
        allowNotFound = true;
      }

      expect(() => createRouter([], new CustomOptions() as any)).toThrowError(
        TypeError,
      );
      expect(() => createRouter([], new CustomOptions() as any)).toThrowError(
        "Invalid options: expected plain object, got CustomOptions",
      );
    });

    it("should skip validation for undefined option values (line 229)", () => {
      // When an option has undefined value, validation is skipped (no error thrown)
      // The undefined value is still assigned via spread, overriding the default
      // This allows conditional configuration like: { trailingSlash: condition ? "always" : undefined }
      expect(() =>
        createRouter(
          [{ name: "test", path: "/test" }],
          // @ts-expect-error: testing undefined value for conditional config
          { trailingSlash: undefined, allowNotFound: true },
        ),
      ).not.toThrowError();
    });
  });

  // 🟡 IMPORTANT: Integration - effect on buildPath
  describe("integration with buildPath", () => {
    it("should apply trailingSlash option to buildPath", () => {
      const r = createTestRouter({ trailingSlash: "always" });

      r.start();

      const path = r.buildPath("users.view", { id: "123" });

      expect(path).toMatch(/\/$/); // ends with /

      r.stop();
    });

    it("should apply trailingSlash 'never' option to buildPath", () => {
      const r = createTestRouter({ trailingSlash: "never" });

      r.start();

      const path = r.buildPath("users.view", { id: "123" });

      expect(path).not.toMatch(/\/$/); // doesn't end with /

      r.stop();
    });

    it("should apply urlParamsEncoding option to buildPath", () => {
      const r = createTestRouter({ urlParamsEncoding: "uriComponent" });

      r.start();

      const path = r.buildPath("users.view", { id: "hello world" });

      expect(path).toContain("hello%20world");

      r.stop();
    });
  });

  // 🟡 IMPORTANT: Integration - effect on matchPath
  describe("integration with matchPath", () => {
    it("should apply trailingSlash option to matchPath", () => {
      const r = createTestRouter({ trailingSlash: "strict" });

      r.start();

      // Route 'users.list' is defined as '/users/list' without trailing slash
      const withoutSlash = r.matchPath("/users/list");
      const withSlash = r.matchPath("/users/list/");

      // In strict mode, trailing slash matters
      expect(withoutSlash).toBeDefined();
      expect(withSlash).toBeUndefined();

      r.stop();
    });
  });

  describe("getOption", () => {
    it("should return a single option value", () => {
      // Values should match getOptions()
      expect(router.getOption("trailingSlash")).toBe(
        router.getOptions().trailingSlash,
      );
      expect(router.getOption("allowNotFound")).toBe(
        router.getOptions().allowNotFound,
      );
    });

    it("should return constructor-provided value", () => {
      const customRouter = createTestRouter({ trailingSlash: "always" });

      expect(customRouter.getOption("trailingSlash")).toBe("always");

      customRouter.stop();
    });

    it("should throw TypeError for non-string option name", () => {
      expect(() => {
        // @ts-expect-error: testing invalid input
        router.getOption(123);
      }).toThrowError(TypeError);

      expect(() => {
        // @ts-expect-error: testing invalid input
        router.getOption(null);
      }).toThrowError(TypeError);
    });

    it("should throw ReferenceError for unknown option name", () => {
      expect(() => {
        // @ts-expect-error: testing unknown option
        router.getOption("unknownOption");
      }).toThrowError(ReferenceError);
    });

    // eslint-disable-next-line vitest/expect-expect -- uses expectTypeOf for compile-time assertions
    it("should be type-safe", () => {
      const trailingSlash = router.getOption("trailingSlash");

      expectTypeOf(trailingSlash).toEqualTypeOf<
        "strict" | "never" | "always" | "preserve"
      >();
    });
  });

  describe("dynamic default route/params with callbacks", () => {
    it("should resolve callback defaultRoute via navigateToDefault", async () => {
      const customRouter = createTestRouter({
        defaultRoute: "home",
      });

      await customRouter.start("/users");

      const state = await customRouter.navigateToDefault();

      expect(state).toEqual(expect.objectContaining({ name: "home" }));

      customRouter.stop();
    });

    it("should resolve callback defaultParams via navigateToDefault", async () => {
      const customRouter = createTestRouter({
        defaultRoute: "users.view",
        defaultParams: () => ({ id: "42" }),
      });

      await customRouter.start("/home");

      const state = await customRouter.navigateToDefault();

      expect(state).toEqual(
        expect.objectContaining({
          name: "users.view",
          params: { id: "42" },
        }),
      );

      customRouter.stop();
    });

    it("should reject callback functions for other options", () => {
      expect(() => {
        createTestRouter({
          trailingSlash: (() => "never") as never,
        });
      }).toThrowError(TypeError);
    });

    it("navigateToDefault resolves callback defaultRoute via getDependency", async () => {
      const customRouter = createTestRouter({
        defaultRoute: ((getDep: (name: string) => unknown) =>
          getDep("routeName")) as Options["defaultRoute"],
      });

      // @ts-expect-error: DefaultDependencies = object, ad-hoc key for test
      customRouter.setDependency("routeName", "home");
      await customRouter.start("/users");

      const state = await customRouter.navigateToDefault();

      expect(state).toEqual(expect.objectContaining({ name: "home" }));

      customRouter.stop();
    });

    it("start resolves callback defaultRoute via getDependency", async () => {
      const customRouter = createTestRouter({
        defaultRoute: ((getDep: (name: string) => unknown) =>
          getDep("routeName")) as Options["defaultRoute"],
      });

      // @ts-expect-error: DefaultDependencies = object, ad-hoc key for test
      customRouter.setDependency("routeName", "home");

      const state = await customRouter.start();

      expect(state).toEqual(expect.objectContaining({ name: "home" }));

      customRouter.stop();
    });

    it("navigateToDefault returns noop when callback resolves to empty string", () => {
      const customRouter = createTestRouter({
        defaultRoute: () => "",
      });

      customRouter.start("/home");

      const cancel = customRouter.navigateToDefault();

      expect(typeof cancel).toBe("function");

      // State should not change (noop)
      expect(customRouter.getState()?.name).toBe("home");

      customRouter.stop();
    });
  });
});
