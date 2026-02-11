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

      // System routes can be registered - verified by no throw above
    });
  });

  describe("atomicity and consistency", () => {
    it("should rollback factory registration if compilation fails", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning non-function
        router.canDeactivate("problematic", () => null);
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.canDeactivate("problematic", true);
      }).not.toThrowError();
    });

    it("should rollback if factory returns non-function", () => {
      expect(() => {
        // @ts-expect-error: testing factory returning object
        router.canDeactivate("test", () => ({}));
      }).toThrowError(TypeError);

      // Verify rollback: can successfully re-register the same route
      expect(() => {
        router.canDeactivate("test", false);
      }).not.toThrowError();
    });

    it("should maintain consistency after failed registration", () => {
      // Register a valid guard first
      router.canDeactivate("valid", false);

      expect(() => {
        // @ts-expect-error: testing invalid handler
        router.canDeactivate("inconsistent", "not-a-function");
      }).toThrowError(TypeError);

      // Valid guard should still work
      router.navigate("valid");
      router.navigate("home", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      });

      // Failed route can be re-registered (was rolled back)
      expect(() => {
        router.canDeactivate("inconsistent", true);
      }).not.toThrowError();
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
      // First guard allows leaving
      router.canDeactivate("home", true);

      router.navigate("home");
      router.navigate("admin", (err) => {
        expect(err).toBeUndefined(); // can leave
      });

      // Replace with blocking guard
      router.canDeactivate("admin", false);

      // Now cannot leave admin
      router.navigate("home", (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
      });

      expect(router.getState()?.name).toBe("admin");
    });
  });
});
