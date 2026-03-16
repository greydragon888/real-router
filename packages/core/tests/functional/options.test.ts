import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";

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

      expect(getPluginApi(customRouter).getOptions().trailingSlash).toBe(
        "always",
      );

      customRouter.stop();
    });

    // 🔴 CRITICAL: Performance - same frozen object every call
    it("should return the same frozen object on each call", () => {
      const opts1 = getPluginApi(router).getOptions();
      const opts2 = getPluginApi(router).getOptions();

      // Same frozen object (performance optimization)
      expect(opts1).toBe(opts2);
      // Object is frozen
      expect(Object.isFrozen(opts1)).toBe(true);
    });

    // 🔴 CRITICAL: Isolation - mutations throw TypeError
    it("should throw when attempting to mutate returned object", () => {
      const opts = getPluginApi(router).getOptions();

      // Mutations should throw in strict mode (Vitest runs in strict mode)
      expect(() => {
        opts.allowNotFound = !opts.allowNotFound;
      }).toThrow(TypeError);

      expect(() => {
        opts.trailingSlash = "always";
      }).toThrow(TypeError);

      expect(() => {
        opts.defaultRoute = "mutated";
      }).toThrow(TypeError);
    });

    // 🔴 CRITICAL: Nested objects are also frozen
    it("should freeze nested objects like queryParams and defaultParams", () => {
      const customRouter = createTestRouter({
        defaultParams: { id: "123" },
        queryParams: { arrayFormat: "brackets" },
      });

      const opts = getPluginApi(customRouter).getOptions();

      // Nested objects should also be frozen
      expect(Object.isFrozen(opts.queryParams)).toBe(true);
      expect(Object.isFrozen(opts.defaultParams)).toBe(true);

      // Mutations to nested objects should throw
      expect(() => {
        opts.queryParams!.arrayFormat = "comma";
      }).toThrow(TypeError);

      expect(() => {
        (opts.defaultParams as Record<string, unknown>).id = "456";
      }).toThrow(TypeError);

      customRouter.stop();
    });

    // 🔴 CRITICAL: Default values
    it("should return all options with default values when no custom options provided", () => {
      const opts = getPluginApi(router).getOptions();

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
      const opts = getPluginApi(router).getOptions();

      expect(opts).toBeDefined();
      expect(opts.trailingSlash).toBe("preserve");
    });

    // 🟡 IMPORTANT: Works after start()
    it("should work after router.start()", async () => {
      await router.start("/home");

      const opts = getPluginApi(router).getOptions();

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

      const opts = getPluginApi(customRouter).getOptions();

      expect(opts.trailingSlash).toBe("always");
      expect(opts.allowNotFound).toBe(false);
      expect(opts.defaultRoute).toBe("dashboard");
      expect(opts.defaultParams).toStrictEqual({ id: "123" });

      customRouter.stop();
    });

    // 🟡 IMPORTANT: Validates limits option (optional field)
    it("should validate and accept limits option", () => {
      const customRouter = createRouter([{ name: "test", path: "/test" }], {
        limits: {
          maxPlugins: 50,
        },
      });

      const opts = getPluginApi(customRouter).getOptions();

      expect(opts.limits).toStrictEqual({ maxPlugins: 50 });

      customRouter.stop();
    });

    // 🟡 IMPORTANT: Returns default values for optional fields when not set
    it("should return default values for optional fields when not set", () => {
      // Create router without custom options
      const plainRouter = createRouter([{ name: "test", path: "/test" }]);
      const opts = getPluginApi(plainRouter).getOptions();

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
      const calls = Array.from({ length: 5 }, () =>
        getPluginApi(router).getOptions(),
      );

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

      const opts = getPluginApi(customRouter).getOptions();

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

      const opts = getPluginApi(customRouter).getOptions();

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
        expect(() => createRouter([], { trailingSlash: true as any })).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { defaultRoute: 123 as any })).toThrow(
          TypeError,
        );
      });

      it("should throw TypeError for null value", () => {
        expect(() => createRouter([], { defaultRoute: null as any })).toThrow(
          TypeError,
        );
      });
    });

    // 🔴 CRITICAL: Enum validation for string options
    describe("enum validation", () => {
      it("should throw TypeError for invalid trailingSlash value", () => {
        expect(() =>
          createRouter([], { trailingSlash: "INVALID" as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { trailingSlash: "INVALID" as any }),
        ).toThrow('expected one of "strict", "never", "always", "preserve"');
      });

      it("should throw TypeError for invalid queryParamsMode value", () => {
        expect(() =>
          createRouter([], { queryParamsMode: "INVALID" as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { queryParamsMode: "INVALID" as any }),
        ).toThrow('expected one of "default", "strict", "loose"');
      });

      it("should throw TypeError for invalid urlParamsEncoding value", () => {
        expect(() =>
          createRouter([], { urlParamsEncoding: "INVALID" as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { urlParamsEncoding: "INVALID" as any }),
        ).toThrow('expected one of "default", "uri", "uriComponent", "none"');
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
          ).not.toThrow();
        }
      });

      it("should accept all valid queryParamsMode values", () => {
        for (const value of ["default", "strict", "loose"] as const) {
          expect(() =>
            createRouter([], { queryParamsMode: value }),
          ).not.toThrow();
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
          ).not.toThrow();
        }
      });

      it("should include invalid value in error message", () => {
        expect(() =>
          createRouter([], { trailingSlash: "typo-value" as any }),
        ).toThrow('got "typo-value"');
      });
    });

    // 🔴 CRITICAL: Object validation
    describe("object validation", () => {
      it("should reject array for object options", () => {
        expect(() => createRouter([], { queryParams: [] as any })).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { queryParams: [] as any })).toThrow(
          "expected plain object",
        );

        expect(() => createRouter([], { defaultParams: [] as any })).toThrow(
          TypeError,
        );
      });

      it("should reject Date instance for object options", () => {
        expect(() =>
          createRouter([], { queryParams: new Date() as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { defaultParams: new Date() as any }),
        ).toThrow(TypeError);
      });

      it("should reject null for object options", () => {
        expect(() => createRouter([], { queryParams: null as any })).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { defaultParams: null as any })).toThrow(
          TypeError,
        );
      });

      it("should reject class instances for object options", () => {
        class CustomClass {
          value = "test";
        }
        const instance = new CustomClass();

        expect(() =>
          createRouter([], { queryParams: instance as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { defaultParams: instance as any }),
        ).toThrow(TypeError);
      });

      it("should reject Object.create(null) for object options", () => {
        const nullProto = Object.create(null);

        expect(() => createRouter([], { queryParams: nullProto })).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { defaultParams: nullProto })).toThrow(
          TypeError,
        );
      });

      it("should accept plain objects for object options", () => {
        expect(() => createRouter([], { queryParams: {} })).not.toThrow();
        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "brackets" } }),
        ).not.toThrow();
        expect(() => createRouter([], { defaultParams: {} })).not.toThrow();
        expect(() =>
          createRouter([], { defaultParams: { id: "123" } }),
        ).not.toThrow();
      });

      it("should reject objects with getters", () => {
        const withGetter = {
          get id() {
            return "123";
          },
        };

        expect(() => createRouter([], { defaultParams: withGetter })).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { defaultParams: withGetter })).toThrow(
          'Getters not allowed in "defaultParams": "id"',
        );
      });

      it("should reject objects with getters in queryParams", () => {
        const withGetter = {
          get arrayFormat() {
            return "bracket";
          },
        } as const;

        expect(() =>
          createRouter([], { queryParams: withGetter as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { queryParams: withGetter as any }),
        ).toThrow("Getters not allowed");
      });

      it("should accept objects with regular properties alongside rejected getters", () => {
        const mixed = {
          normalProp: "value",
          get dangerousProp() {
            return "danger";
          },
        };

        expect(() => createRouter([], { defaultParams: mixed })).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { defaultParams: mixed })).toThrow(
          'Getters not allowed in "defaultParams": "dangerousProp"',
        );
      });

      // 🔴 CRITICAL: queryParams key validation
      it("should reject unknown keys in queryParams", () => {
        expect(() =>
          createRouter([], { queryParams: { unknownKey: "value" } as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { queryParams: { unknownKey: "value" } as any }),
        ).toThrow('Unknown queryParams key: "unknownKey"');
      });

      // 🔴 CRITICAL: queryParams value validation
      it("should reject invalid arrayFormat value", () => {
        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "invalid" } as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "invalid" } as any }),
        ).toThrow('expected one of "none", "brackets", "index", "comma"');
      });

      it("should reject invalid booleanFormat value", () => {
        expect(() =>
          createRouter([], { queryParams: { booleanFormat: "wrong" } as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { queryParams: { booleanFormat: "wrong" } as any }),
        ).toThrow('expected one of "none", "string", "empty-true"');
      });

      it("should reject invalid nullFormat value", () => {
        expect(() =>
          createRouter([], { queryParams: { nullFormat: "bad" } as any }),
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { queryParams: { nullFormat: "bad" } as any }),
        ).toThrow('expected one of "default", "hidden"');
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
        ).not.toThrow();

        expect(() =>
          createRouter([], {
            queryParams: {
              arrayFormat: "brackets",
              booleanFormat: "string",
              nullFormat: "hidden",
            },
          }),
        ).not.toThrow();

        expect(() =>
          createRouter([], {
            queryParams: {
              arrayFormat: "index",
              booleanFormat: "empty-true",
            },
          }),
        ).not.toThrow();

        expect(() =>
          createRouter([], { queryParams: { arrayFormat: "comma" } }),
        ).not.toThrow();
      });
    });

    // 🔴 CRITICAL: Non-existent option
    describe("non-existent options", () => {
      it("should throw TypeError for unknown option name", () => {
        expect(() => createRouter([], { unknownOption: true } as any)).toThrow(
          TypeError,
        );
        expect(() => createRouter([], { unknownOption: true } as any)).toThrow(
          'Unknown option: "unknownOption"',
        );
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
          expect(() => createRouter([], { [key]: {} } as any)).toThrow();
        }
      });
    });

    // 🟢 DESIRABLE: Edge cases
    describe("edge cases", () => {
      it("should accept empty string for defaultRoute", () => {
        const r = createRouter([], { defaultRoute: "" });

        expect(getPluginApi(r).getOptions().defaultRoute).toBe("");
      });

      it("should accept empty object for queryParams", () => {
        const r = createRouter([], { queryParams: {} });

        expect(getPluginApi(r).getOptions().queryParams).toStrictEqual({});
      });

      it("should accept empty object for defaultParams", () => {
        const r = createRouter([], { defaultParams: {} });

        expect(getPluginApi(r).getOptions().defaultParams).toStrictEqual({});
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
        ).toThrow(TypeError);
        expect(() =>
          createRouter([], { defaultRoute: evilValue as any }),
        ).toThrow("expected string, got object");
      });

      it("should reject number for string option", () => {
        expect(() => createRouter([], { trailingSlash: 1 as any })).toThrow(
          TypeError,
        );
      });

      it("should accept frozen object for defaultParams", () => {
        const frozenParams = Object.freeze({ id: "123" });
        const r = createRouter([], { defaultParams: frozenParams });

        expect(getPluginApi(r).getOptions().defaultParams).toStrictEqual({
          id: "123",
        });
      });

      it("should accept sealed object for defaultParams", () => {
        const sealedParams = Object.seal({ id: "456" });
        const r = createRouter([], { defaultParams: sealedParams });

        expect(getPluginApi(r).getOptions().defaultParams).toStrictEqual({
          id: "456",
        });
      });
    });
  });

  describe("options.ts edge cases (lines 31, 73, 79)", () => {
    it("should throw TypeError for unknown option in createRouter (line 73)", () => {
      expect(() => createRouter([], { unknownOption: "value" } as any)).toThrow(
        TypeError,
      );
      expect(() => createRouter([], { unknownOption: "value" } as any)).toThrow(
        'Unknown option: "unknownOption"',
      );
    });

    it("should throw TypeError for array as options in createRouter (line 194)", () => {
      expect(() => createRouter([], [] as any)).toThrow(TypeError);
      expect(() => createRouter([], [] as any)).toThrow(
        "Invalid options: expected plain object, got array",
      );
    });

    it("should throw TypeError for class instance as options in createRouter (line 194)", () => {
      class CustomOptions {
        allowNotFound = true;
      }

      expect(() => createRouter([], new CustomOptions() as any)).toThrow(
        TypeError,
      );
      expect(() => createRouter([], new CustomOptions() as any)).toThrow(
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
      ).not.toThrow();
    });
  });

  // 🟡 IMPORTANT: Integration - effect on buildPath
  describe("integration with buildPath", () => {
    it("should apply trailingSlash option to buildPath", async () => {
      const r = createTestRouter({ trailingSlash: "always" });

      await r.start("/home");

      const path = r.buildPath("users.view", { id: "123" });

      expect(path).toMatch(/\/$/); // ends with /

      r.stop();
    });

    it("should apply trailingSlash 'never' option to buildPath", async () => {
      const r = createTestRouter({ trailingSlash: "never" });

      await r.start("/home");

      const path = r.buildPath("users.view", { id: "123" });

      expect(path).not.toMatch(/\/$/); // doesn't end with /

      r.stop();
    });

    it("should apply urlParamsEncoding option to buildPath", async () => {
      const r = createTestRouter({ urlParamsEncoding: "uriComponent" });

      await r.start("/home");

      const path = r.buildPath("users.view", { id: "hello world" });

      expect(path).toContain("hello%20world");

      r.stop();
    });
  });

  // 🟡 IMPORTANT: Integration - effect on matchPath
  describe("integration with matchPath", () => {
    it("should apply trailingSlash option to matchPath", async () => {
      const r = createTestRouter({ trailingSlash: "strict" });

      await r.start("/home");

      // Route 'users.list' is defined as '/users/list' without trailing slash
      const withoutSlash = getPluginApi(r).matchPath("/users/list");
      const withSlash = getPluginApi(r).matchPath("/users/list/");

      // In strict mode, trailing slash matters
      expect(withoutSlash).toBeDefined();
      expect(withSlash).toBeUndefined();

      r.stop();
    });
  });

  describe("dynamic default route/params with callbacks", () => {
    it("should resolve callback defaultRoute via navigateToDefault", async () => {
      const customRouter = createTestRouter({
        defaultRoute: "home",
      });

      await customRouter.start("/users");

      const state = await customRouter.navigateToDefault();

      expect(state).toStrictEqual(expect.objectContaining({ name: "home" }));

      customRouter.stop();
    });

    it("should resolve callback defaultParams via navigateToDefault", async () => {
      const customRouter = createTestRouter({
        defaultRoute: "users.view",
        defaultParams: () => ({ id: "42" }),
      });

      await customRouter.start("/home");

      const state = await customRouter.navigateToDefault();

      expect(state).toStrictEqual(
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
      }).toThrow(TypeError);
    });

    it("navigateToDefault resolves callback defaultRoute via getDependency", async () => {
      const customRouter = createTestRouter({
        defaultRoute: ((getDep: (name: string) => unknown) =>
          getDep("routeName")) as Options["defaultRoute"],
      });

      const deps = getDependenciesApi(customRouter);

      // @ts-expect-error: DefaultDependencies = object, ad-hoc key for test
      deps.set("routeName", "home");
      await customRouter.start("/users");

      const state = await customRouter.navigateToDefault();

      expect(state).toStrictEqual(expect.objectContaining({ name: "home" }));

      customRouter.stop();
    });

    it("start resolves callback defaultRoute via getDependency", async () => {
      const customRouter = createTestRouter({
        defaultRoute: ((getDep: (name: string) => unknown) =>
          getDep("routeName")) as Options["defaultRoute"],
      });

      const deps = getDependenciesApi(customRouter);

      // @ts-expect-error: DefaultDependencies = object, ad-hoc key for test
      deps.set("routeName", "home");

      const state = await customRouter.start("/home");

      expect(state).toStrictEqual(expect.objectContaining({ name: "home" }));

      customRouter.stop();
    });

    it("navigateToDefault returns noop when callback resolves to empty string", async () => {
      const customRouter = createTestRouter({
        defaultRoute: () => "",
      });

      await customRouter.start("/home");

      // navigateToDefault now returns a Promise that rejects when defaultRoute returns empty string
      await expect(customRouter.navigateToDefault()).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      // State should not change (noop)
      expect(customRouter.getState()?.name).toBe("home");

      customRouter.stop();
    });
  });
});
