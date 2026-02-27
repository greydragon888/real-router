import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getLifecycleApi } from "@real-router/core";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  omitMeta,
  type Router,
} from "./setup";

let router: Router;
let lifecycle: ReturnType<typeof getLifecycleApi>;

describe("core/route-lifecycle/addDeactivateGuard", () => {
  beforeEach(async () => {
    router = await createLifecycleTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  it("should block navigation if a component refuses deactivation", async () => {
    lifecycle.addDeactivateGuard("users.list", () => () => Promise.reject());

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

    lifecycle.addDeactivateGuard("users.list", true);

    await router.navigate("users");

    expect(omitMeta(router.getState())).toStrictEqual({
      name: "users",
      params: {},
      path: "/users",
    });
  });

  it("should register and override canDeactivate handlers", async () => {
    lifecycle.addDeactivateGuard("users.list", false);

    await router.navigate("users.list");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toStrictEqual(errorCodes.CANNOT_DEACTIVATE);
      expect(error?.segment).toStrictEqual("users.list");
    }

    lifecycle.addDeactivateGuard("users.list", true);

    await router.navigate("users");
  });

  it("should block navigation if canDeactivate returns an Error", async () => {
    lifecycle.addDeactivateGuard("users.list", () => () => {
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

  it("should return error when canDeactivate returns false", async () => {
    lifecycle.addDeactivateGuard("sign-in", () => () => false);

    await router.navigate("sign-in");

    try {
      await router.navigate("users");
    } catch (error: any) {
      expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    }

    expect(router.getState()?.name).toBe("sign-in");
  });

  describe("validation and edge cases", () => {
    it("should register guards without throwing", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("route1", true);
        lifecycle.addDeactivateGuard("route2", false);
      }).not.toThrowError();
    });

    it("should throw TypeError for invalid handler types", () => {
      expect(() => {
        // @ts-expect-error: testing null
        lifecycle.addDeactivateGuard("route1", null);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing undefined
        lifecycle.addDeactivateGuard("route2", undefined);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing number
        lifecycle.addDeactivateGuard("route3", 123);
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing string
        lifecycle.addDeactivateGuard("route4", "true");
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing object
        lifecycle.addDeactivateGuard("route5", {});
      }).toThrowError(TypeError);
      expect(() => {
        // @ts-expect-error: testing NaN
        lifecycle.addDeactivateGuard("route6", Number.NaN);
      }).toThrowError(TypeError);
    });

    it("should throw TypeError if factory returns non-function", () => {
      // Factory returning null
      expect(() => {
        // @ts-expect-error: testing factory returning null
        lifecycle.addDeactivateGuard("route1", () => null);
      }).toThrowError(TypeError);

      // Factory returning undefined
      expect(() => {
        // @ts-expect-error: testing factory returning undefined
        lifecycle.addDeactivateGuard("route2", () => undefined);
      }).toThrowError(TypeError);

      // Factory returning number
      expect(() => {
        // @ts-expect-error: testing factory returning number
        lifecycle.addDeactivateGuard("route3", () => 42);
      }).toThrowError(TypeError);

      // Factory returning object
      expect(() => {
        // @ts-expect-error: testing factory returning object
        lifecycle.addDeactivateGuard("route4", () => ({}));
      }).toThrowError(TypeError);
    });

    it("should throw TypeError for invalid route names", () => {
      // Whitespace-only (empty string is valid root node)
      expect(() => {
        lifecycle.addDeactivateGuard("   ", true);
      }).toThrowError(TypeError);

      // Route name with spaces
      expect(() => {
        lifecycle.addDeactivateGuard("route name", true);
      }).toThrowError(TypeError);

      // Route name starting with number
      expect(() => {
        lifecycle.addDeactivateGuard("1route", true);
      }).toThrowError(TypeError);

      // Route name with special characters
      expect(() => {
        lifecycle.addDeactivateGuard("route#name", true);
      }).toThrowError(TypeError);

      // Route name ending with dot
      expect(() => {
        lifecycle.addDeactivateGuard("route.", true);
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        lifecycle.addDeactivateGuard("route..name", true);
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const longButValidName = "a".repeat(10_000);

      expect(() => {
        lifecycle.addDeactivateGuard(longButValidName, true);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        lifecycle.addDeactivateGuard(tooLongName, true);
      }).toThrowError(TypeError);
    });

    it("should allow system routes with @@ prefix", () => {
      expect(() => {
        lifecycle.addDeactivateGuard("@@notFound", true);
      }).not.toThrowError();

      // System routes can be registered - verified by no throw above
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning non-function
        lifecycle.addDeactivateGuard("problematic", () => null);
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        lifecycle.addDeactivateGuard("problematic", true);
      }).not.toThrowError();
    });

    it("should rollback if factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning object
        lifecycle.addDeactivateGuard("test", () => ({}));
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        lifecycle.addDeactivateGuard("test", false);
      }).not.toThrowError();
    });

    it("should maintain consistency after failed registration", async () => {
      // Register a valid guard first
      lifecycle.addDeactivateGuard("admin", false);

      expect(() => {
        // @ts-expect-error: testing invalid handler
        lifecycle.addDeactivateGuard("index", "not-a-function");
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
        lifecycle.addDeactivateGuard("index", true);
      }).not.toThrowError();
    });
  });

  describe("overwriting guards", () => {
    it("should log warning when overwriting existing guard", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      lifecycle.addDeactivateGuard("route", true);

      // First registration - no warning
      expect(warnSpy).not.toHaveBeenCalled();

      // Second registration - should warn
      lifecycle.addDeactivateGuard("route", false);

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.canDeactivate",
        expect.stringContaining("Overwriting"),
      );

      warnSpy.mockRestore();
    });

    it("should replace old guard with new one", async () => {
      // First guard allows leaving
      lifecycle.addDeactivateGuard("admin", true);

      await router.navigate("admin");
      await router.navigate("index");

      // Replace with blocking guard
      lifecycle.addDeactivateGuard("index", false);

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
