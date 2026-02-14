import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  omitMeta,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/addDeactivateGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if a component refuses deactivation", async () => {
    router.addDeactivateGuard("users.list", () => () => Promise.reject());

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      expect(error?.segment).toStrictEqual("users.list");
    }

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users.list",
      params: {},
      path: "/users/list",
    });

    router.addDeactivateGuard("users.list", true);

    await router.navigate("users");

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users",
      params: {},
      path: "/users",
    });
  });

  it("should register and override canDeactivate handlers", async () => {
    router.addDeactivateGuard("users.list", false);

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      expect(error?.segment).toStrictEqual("users.list");
    }

    router.addDeactivateGuard("users.list", true);

    await router.navigate("users");
  });

  it("should block navigation if canDeactivate returns an Error", async () => {
    router.addDeactivateGuard("users.list", () => () => {
      throw new Error("blocked");
    });

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error).toBeDefined();
      expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    }
  });

  it("should return error when canDeactivate returns a different route (guards cannot redirect)", async () => {
    router.addDeactivateGuard("sign-in", () => () => ({
      name: "index",
      params: {},
      path: "/",
    }));

    await router.navigate("sign-in");

    try {
      await router.navigate("users");
    } catch (error: any) {
      // Guards cannot redirect - should return CANNOT_DEACTIVATE error
      expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      expect(error?.attemptedRedirect).toStrictEqual({
        name: "index",
        params: {},
        path: "/",
      });
    }

    // Should remain on sign-in, not redirect to index
    expect(router.getState()?.name).toBe("sign-in");
  });

  describe("validation and edge cases", () => {
    it("should return router instance for method chaining (fluent interface)", () => {
      const result1 = router.addDeactivateGuard("route1", true);
      const result2 = router.addDeactivateGuard("route2", false);

      expect(result1).toBe(router);
      expect(result2).toBe(router);
    });

    it("should throw TypeError for invalid handler types", () => {
      // @ts-expect-error: testing null
      expect(() => router.addDeactivateGuard("route1", null)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing undefined
      expect(() => router.addDeactivateGuard("route2", undefined)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing number
      expect(() => router.addDeactivateGuard("route3", 123)).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing string
      expect(() => router.addDeactivateGuard("route4", "true")).toThrowError(
        TypeError,
      );
      // @ts-expect-error: testing object
      expect(() => router.addDeactivateGuard("route5", {})).toThrowError(
        TypeError,
      );
      expect(() =>
        // @ts-expect-error: testing NaN
        router.addDeactivateGuard("route6", Number.NaN),
      ).toThrowError(TypeError);
    });

    it("should throw TypeError if factory returns non-function", () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        router.addDeactivateGuard("route1", () => null);
      }).toThrowError(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        router.addDeactivateGuard("route2", () => undefined);
      }).toThrowError(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        router.addDeactivateGuard("route3", () => 42);
      }).toThrowError(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.addDeactivateGuard("route4", () => ({}));
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid route names", () => {
      // Whitespace-only (empty string is valid root node)
      expect(() => {
        router.addDeactivateGuard("   ", true);
      }).toThrowError(TypeError);

      // Route name with spaces
      expect(() => {
        router.addDeactivateGuard("route name", true);
      }).toThrowError(TypeError);

      // Route name starting with number
      expect(() => {
        router.addDeactivateGuard("1route", true);
      }).toThrowError(TypeError);

      // Route name with special characters
      expect(() => {
        router.addDeactivateGuard("route#name", true);
      }).toThrowError(TypeError);

      // Route name ending with dot
      expect(() => {
        router.addDeactivateGuard("route.", true);
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        router.addDeactivateGuard("route..name", true);
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const longButValidName = "a".repeat(10_000);

      expect(() => {
        router.addDeactivateGuard(longButValidName, true);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        router.addDeactivateGuard(tooLongName, true);
      }).toThrowError(TypeError);
    });

    it("should allow system routes with @@ prefix", () => {
      expect(() => {
        router.addDeactivateGuard("@@notFound", true);
      }).not.toThrowError();

      // System routes can be registered - verified by no throw above
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning non-function
        router.addDeactivateGuard("problematic", () => null);
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.addDeactivateGuard("problematic", true);
      }).not.toThrowError();
    });

    it("should rollback if factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.addDeactivateGuard("test", () => ({}));
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.addDeactivateGuard("test", false);
      }).not.toThrowError();
    });

    it("should maintain consistency after failed registration", async () => {
      // Register a valid guard first
      router.addDeactivateGuard("admin", false);

      expect(() => {
        // @ts-expect-error: testing invalid handler
        router.addDeactivateGuard("index", "not-a-function");
      }).toThrowError(TypeError);

      // Valid guard should still work
      await router.navigate("admin");
      try {
        await router.navigate("home");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      // Failed route can be re-registered (was rolled back)
      expect(() => {
        router.addDeactivateGuard("index", true);
      }).not.toThrowError();
    });
  });

  describe("overwriting guards", () => {
    it("should log warning when overwriting existing guard", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.addDeactivateGuard("route", true);

      // First registration - no warning
      expect(warnSpy).not.toHaveBeenCalled();

      // Second registration - should warn
      router.addDeactivateGuard("route", false);

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.canDeactivate",
        expect.stringContaining("Overwriting"),
      );

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", async () => {
      // First guard allows leaving
      router.addDeactivateGuard("admin", true);

      await router.navigate("admin");
      await router.navigate("index");

      // Replace with blocking guard
      router.addDeactivateGuard("index", false);

      // Now cannot leave index
      try {
        await router.navigate("admin");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      }

      expect(router.getState()?.name).toBe("index");
    });
  });
});
