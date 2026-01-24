import { logger } from "@real-router/logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import {
  createLifecycleTestRouter,
  createTestRouter,
  errorCodes,
  noop,
  omitMeta,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/canDeactivate", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if a component refuses deactivation", async () => {
    router.canDeactivate("users.list", () => () => Promise.reject());

    router.navigate("users.list");

    await new Promise<void>((resolve) => {
      router.navigate("users", (err) => {
        expect(err?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
        expect(err?.segment).toStrictEqual("users.list");

        resolve();
      });
    });

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users.list",
      params: {},
      path: "/users/list",
    });

    router.canDeactivate("users.list", true);

    router.navigate("users");

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users",
      params: {},
      path: "/users",
    });
  });

  it("should register and override canDeactivate handlers", () => {
    router.canDeactivate("users.list", false);

    router.navigate("users.list");

    router.navigate("users", (err) => {
      expect(err?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      expect(err?.segment).toStrictEqual("users.list");
    });

    router.canDeactivate("users.list", true);

    router.navigate("users", (err) => {
      expect(err).toBe(undefined);
    });
  });

  it("should block navigation if canDeactivate returns an Error", () => {
    router.canDeactivate("users.list", () => () => {
      throw new Error("blocked");
    });

    router.navigate("users.list");

    router.navigate("users", (err) => {
      expect(err).toBeDefined();
      expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    });
  });

  it("should return error when canDeactivate returns a different route (guards cannot redirect)", () => {
    router.canDeactivate("sign-in", () => () => ({
      name: "index",
      params: {},
      path: "/",
    }));

    router.navigate("sign-in");

    router.navigate("users", (err) => {
      // Guards cannot redirect - should return CANNOT_DEACTIVATE error
      expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      expect(err?.attemptedRedirect).toStrictEqual({
        name: "index",
        params: {},
        path: "/",
      });
    });

    // Should remain on sign-in, not redirect to index
    expect(router.getState()?.name).toBe("sign-in");
  });

  describe("validation and edge cases", () => {
    it("should return router instance for method chaining (fluent interface)", () => {
      const result1 = router.canDeactivate("route1", true);
      const result2 = router.canDeactivate("route2", false);

      expect(result1).toBe(router);
      expect(result2).toBe(router);
    });

    it("should throw TypeError for invalid handler types", () => {
      // @ts-expect-error: testing null
      expect(() => router.canDeactivate("route1", null)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing undefined
      expect(() => router.canDeactivate("route2", undefined)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing number
      expect(() => router.canDeactivate("route3", 123)).toThrowError(TypeError);
      // @ts-expect-error: testing string
      expect(() => router.canDeactivate("route4", "true")).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing object
      expect(() => router.canDeactivate("route5", {})).toThrowError(TypeError);
      // @ts-expect-error: testing NaN
      expect(() => router.canDeactivate("route6", Number.NaN)).toThrowError(
        TypeError,
      );
    });

    it("should throw TypeError if factory returns non-function", () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.canDeactivate("route1", () => null);
      }).toThrowError(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        router.canDeactivate("route2", () => undefined);
      }).toThrowError(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        router.canDeactivate("route3", () => 42);
      }).toThrowError(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.canDeactivate("route4", () => ({}));
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid route names", () => {
      // Whitespace-only (empty string is valid root node)
      expect(() => {
        router.canDeactivate("   ", true);
      }).toThrowError(TypeError);

      // Route name with spaces
      expect(() => {
        router.canDeactivate("route name", true);
      }).toThrowError(TypeError);

      // Route name starting with number
      expect(() => {
        router.canDeactivate("1route", true);
      }).toThrowError(TypeError);

      // Route name with special characters
      expect(() => {
        router.canDeactivate("route#name", true);
      }).toThrowError(TypeError);

      // Route name ending with dot
      expect(() => {
        router.canDeactivate("route.", true);
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        router.canDeactivate("route..name", true);
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const longButValidName = "a".repeat(10_000);

      expect(() => {
        router.canDeactivate(longButValidName, true);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        router.canDeactivate(tooLongName, true);
      }).toThrowError(TypeError);
    });

    it("should allow system routes with @@ prefix", () => {
      expect(() => {
        router.canDeactivate("@@notFound", true);
      }).not.toThrowError();

      const [deactivateFns] = router.getLifecycleFunctions();

      expect(deactivateFns.get("@@notFound")).toBeDefined();

      expectTypeOf(deactivateFns.get("@@notFound")!).toBeFunction();
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", () => {
      const initialFactories = router.getLifecycleFactories();
      const initialSize = Object.keys(initialFactories[0]).length;

      expect(() => {
        // @ts-expect-error: testing factory returning non-function
        router.canDeactivate("route", () => null);
      }).toThrowError(TypeError);

      const finalFactories = router.getLifecycleFactories();
      const finalSize = Object.keys(finalFactories[0]).length;

      // Size should not have changed
      expect(finalSize).toBe(initialSize);
      // Route should not be registered
      expect(finalFactories[0].route).toBe(undefined);
    });

    it("should rollback if factory returns non-function", () => {
      const [deactivateFnsBefore] = router.getLifecycleFunctions();
      const beforeSize = deactivateFnsBefore.size;

      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.canDeactivate("test", () => ({}));
      }).toThrowError(TypeError);

      const [deactivateFnsAfter] = router.getLifecycleFunctions();
      const afterSize = deactivateFnsAfter.size;

      expect(afterSize).toBe(beforeSize);
      expect(deactivateFnsAfter.get("test")).toBe(undefined);
    });

    it("should maintain Map consistency after failed registration", () => {
      const [beforeFactories] = router.getLifecycleFactories();
      const [beforeFunctions] = router.getLifecycleFunctions();

      expect(() => {
        // @ts-expect-error: testing invalid handler
        router.canDeactivate("inconsistent", "not-a-function");
      }).toThrowError(TypeError);

      const [afterFactories] = router.getLifecycleFactories();
      const [afterFunctions] = router.getLifecycleFunctions();

      // Both maps should still be consistent - neither should have the failed route
      expect(afterFactories.inconsistent).toBe(undefined);
      expect(afterFunctions.get("inconsistent")).toBe(undefined);

      // Size should not have changed
      expect(Object.keys(afterFactories)).toHaveLength(
        Object.keys(beforeFactories).length,
      );
      expect(afterFunctions.size).toBe(beforeFunctions.size);
    });
  });

  describe("boolean shorthand", () => {
    it("should compile boolean true to function returning true", () => {
      router.canDeactivate("trueRoute", true);

      const [deactivateFns] = router.getLifecycleFunctions();
      const fn = deactivateFns.get("trueRoute")!;

      expectTypeOf(fn).toBeFunction();

      expect(
        fn({ name: "test", path: "/test", params: {} }, undefined, () => {}),
      ).toBe(true);
    });

    it("should compile boolean false to function returning false", () => {
      router.canDeactivate("falseRoute", false);

      const [deactivateFns] = router.getLifecycleFunctions();
      const fn = deactivateFns.get("falseRoute")!;

      expectTypeOf(fn).toBeFunction();

      expect(
        fn({ name: "test", path: "/test", params: {} }, undefined, () => {}),
      ).toBe(false);
    });
  });

  describe("overwriting guards", () => {
    it("should log warning when overwriting existing guard", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.canDeactivate("route", true);

      // First registration - no warning
      expect(warnSpy).not.toHaveBeenCalled();

      // Second registration - should warn
      router.canDeactivate("route", false);

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.canDeactivate",
        expect.stringContaining("Overwriting"),
      );

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", () => {
      router.canDeactivate("route", true);

      const [deactivateFnsBefore] = router.getLifecycleFunctions();
      const oldFn = deactivateFnsBefore.get("route");

      router.canDeactivate("route", false);

      const [deactivateFnsAfter] = router.getLifecycleFunctions();
      const newFn = deactivateFnsAfter.get("route");

      // Functions should be different
      expect(oldFn).not.toBe(newFn);

      // New function should return false
      expect(
        newFn!(
          { name: "test", path: "/test", params: {} },
          undefined,
          () => {},
        ),
      ).toBe(false);
    });
  });

  describe("limits", () => {
    it("should allow registering up to 200 lifecycle handlers", () => {
      const tempRouter = createTestRouter();
      // Note: createTestRouter has 2 pre-registered canActivate handlers
      // Maximum is 199 total handlers (check is >= 200)

      // Register 97 more canActivate and 100 canDeactivate
      // Total: 2 (pre-existing) + 97 + 100 = 199 (at limit)
      for (let i = 0; i < 97; i++) {
        expect(() => {
          tempRouter.canActivate(`activateRoute${i}`, true);
        }).not.toThrowError();
      }

      for (let i = 0; i < 100; i++) {
        expect(() => {
          tempRouter.canDeactivate(`deactivateRoute${i}`, true);
        }).not.toThrowError();
      }
    });

    it("should throw Error when exceeding 200 handlers limit", () => {
      const tempRouter = createTestRouter();
      // Note: Limits are separate for canActivate and canDeactivate
      // Maximum is 199 canDeactivate handlers (check is >= 200)

      // Register 198 canDeactivate handlers (routes 1-198)
      for (let i = 1; i <= 198; i++) {
        tempRouter.canDeactivate(`route${i}`, true);
      }

      // 199th handler should succeed (last one before limit)
      expect(() => {
        tempRouter.canDeactivate("route199", true);
      }).not.toThrowError();

      // 200th handler should throw (exceeds limit)
      expect(() => {
        tempRouter.canDeactivate("route200", true);
      }).toThrowError(Error);
      expect(() => {
        tempRouter.canDeactivate("route200", true);
      }).toThrowError(/limit exceeded.*200/i);
    });

    it("should log warning at 50 handlers", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);
      const tempRouter = createTestRouter();
      // Note: Limits are separate for canActivate and canDeactivate

      // Clear any previous calls
      warnSpy.mockClear();

      // Register 49 canDeactivate handlers
      for (let i = 1; i <= 49; i++) {
        tempRouter.canDeactivate(`route${i}`, true);
      }

      // Count warning calls mentioning "50" before 50th handler
      const warningsBefore = warnSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("50")),
      ).length;

      // Register 50th handler - should trigger warning
      tempRouter.canDeactivate("route50", true);

      // Count warning calls mentioning "50" after 50th handler
      const warningsAfter = warnSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("50")),
      ).length;

      // Should have one more warning mentioning "50" after registration
      expect(warningsAfter).toBeGreaterThan(warningsBefore);

      warnSpy.mockRestore();
    });

    it("should log error at 100 handlers", () => {
      const errorSpy = vi.spyOn(logger, "error").mockImplementation(noop);
      const tempRouter = createTestRouter();
      // Note: Limits are separate for canActivate and canDeactivate

      // Clear any previous calls
      errorSpy.mockClear();

      // Register 99 canDeactivate handlers
      for (let i = 1; i <= 99; i++) {
        tempRouter.canDeactivate(`route${i}`, true);
      }

      // Count error calls mentioning "100" before 100th handler
      const errorsBefore = errorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("100")),
      ).length;

      // Register 100th handler - should trigger error log
      tempRouter.canDeactivate("route100", true);

      // Count error calls mentioning "100" after 100th handler
      const errorsAfter = errorSpy.mock.calls.filter((call) =>
        call.some((arg) => typeof arg === "string" && arg.includes("100")),
      ).length;

      // Should have at least one error mentioning "100" after registration
      expect(errorsAfter).toBeGreaterThan(errorsBefore);

      errorSpy.mockRestore();
    });

    it("should not count overwrites against the limit", () => {
      const tempRouter = createTestRouter();
      // Note: Limits are separate for canActivate and canDeactivate
      // Maximum is 199 canDeactivate handlers (check is >= 200)

      // Register 100 canDeactivate handlers (route1 - route100)
      for (let i = 1; i <= 100; i++) {
        tempRouter.canDeactivate(`route${i}`, true);
      }

      // Overwriting existing handlers should not increase count
      expect(() => {
        tempRouter.canDeactivate("route1", false);
        tempRouter.canDeactivate("route2", false);
        tempRouter.canDeactivate("route3", false);
      }).not.toThrowError();

      // Should still be able to add 99 new handlers (100 existing + 99 new = 199, at limit)
      for (let i = 101; i <= 199; i++) {
        expect(() => {
          tempRouter.canDeactivate(`route${i}`, true);
        }).not.toThrowError();
      }

      // 200th handler should throw (exceeds limit)
      expect(() => {
        tempRouter.canDeactivate("route200", true);
      }).toThrowError(Error);
    });
  });
});
