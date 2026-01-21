import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/clearCanActivate", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove registered canActivate handler", () => {
    router.canActivate("users", false);

    expect(router.getLifecycleFunctions()[1].get("users")).toBeDefined();

    router.clearCanActivate("users");

    expect(router.getLifecycleFunctions()[1].get("users")).toBe(undefined);
  });

  it("should allow navigation after clearing a blocking canActivate", () => {
    router.canActivate("admin", false);

    router.navigate("admin", (err1) => {
      expect(err1?.code).toBe(errorCodes.CANNOT_ACTIVATE);
    });

    router.clearCanActivate("admin");

    router.navigate("admin", (err2) => {
      expect(err2).toBe(undefined);
    });

    expect(router.getState()?.name).toBe("admin");
  });

  describe("validation and edge cases", () => {
    it("should return router instance for method chaining (fluent interface)", () => {
      router.canActivate("route1", true);

      const result = router.clearCanActivate("route1");

      expect(result).toBe(router);
    });

    it("should throw TypeError for invalid route names", () => {
      // Whitespace-only (empty string is valid root node)
      expect(() => {
        router.clearCanActivate("   ");
      }).toThrowError(TypeError);

      // Route name with spaces
      expect(() => {
        router.clearCanActivate("route name");
      }).toThrowError(TypeError);

      // Route name starting with number
      expect(() => {
        router.clearCanActivate("1route");
      }).toThrowError(TypeError);

      // Route name with special characters
      expect(() => {
        router.clearCanActivate("route#name");
      }).toThrowError(TypeError);

      // Route name ending with dot
      expect(() => {
        router.clearCanActivate("route.");
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        router.clearCanActivate("route..name");
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const longButValidName = "a".repeat(10_000);

      router.canActivate(longButValidName, true);

      expect(() => {
        router.clearCanActivate(longButValidName);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        router.clearCanActivate(tooLongName);
      }).toThrowError(TypeError);
    });

    it("should work with system routes with @@ prefix", () => {
      router.canActivate("@@notFound", true);

      expect(() => {
        router.clearCanActivate("@@notFound");
      }).not.toThrowError();

      const [, activateFns] = router.getLifecycleFunctions();

      expect(activateFns.get("@@notFound")).toBe(undefined);
    });

    it("should work with nested route names", () => {
      router.canActivate("users.profile.settings", true);

      const [, activateFnsBefore] = router.getLifecycleFunctions();

      expect(activateFnsBefore.get("users.profile.settings")).toBeDefined();

      router.clearCanActivate("users.profile.settings");

      const [, activateFnsAfter] = router.getLifecycleFunctions();

      expect(activateFnsAfter.get("users.profile.settings")).toBe(undefined);
    });
  });

  describe("warning behavior", () => {
    it("should log warning when handler not found", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.clearCanActivate("nonExistentRoute");

      expect(warnSpy).toHaveBeenCalledWith(
        '[router.clearCanActivate] No canActivate handler found for route "nonExistentRoute"',
      );

      warnSpy.mockRestore();
    });

    it("should not log warning when handler exists and is deleted", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      router.canActivate("existingRoute", true);

      // Clear the spy calls from registration
      warnSpy.mockClear();

      router.clearCanActivate("existingRoute");

      // Should not have any calls with "No canActivate handler found"
      const notFoundWarnings = warnSpy.mock.calls.filter((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("No canActivate handler found"),
        ),
      );

      expect(notFoundWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe("dual deletion from maps", () => {
    it("should remove handler from both factories and functions maps", () => {
      router.canActivate("route", true);

      const [, activateFactoriesBefore] = router.getLifecycleFactories();
      const [, activateFunctionsBefore] = router.getLifecycleFunctions();

      expect(activateFactoriesBefore.route).toBeDefined();
      expect(activateFunctionsBefore.get("route")).toBeDefined();

      router.clearCanActivate("route");

      const [, activateFactoriesAfter] = router.getLifecycleFactories();
      const [, activateFunctionsAfter] = router.getLifecycleFunctions();

      expect(activateFactoriesAfter.route).toBe(undefined);
      expect(activateFunctionsAfter.get("route")).toBe(undefined);
    });

    it("should handle case when only factory exists (edge case)", () => {
      // This is a theoretical edge case where maps are out of sync
      router.canActivate("route", true);

      // Manually clear only functions (simulating inconsistent state)
      const [, activateFunctions] = router.getLifecycleFunctions();

      activateFunctions.delete("route");

      // Should still clear factory without error
      expect(() => {
        router.clearCanActivate("route");
      }).not.toThrowError();

      const [, activateFactoriesAfter] = router.getLifecycleFactories();

      expect(activateFactoriesAfter.route).toBe(undefined);
    });
  });

  describe("multiple operations", () => {
    it("should be idempotent - safe to call multiple times", () => {
      router.canActivate("route", true);

      router.clearCanActivate("route");

      // Should not throw when clearing already cleared route
      expect(() => {
        router.clearCanActivate("route");
      }).not.toThrowError();

      // Third time for good measure
      expect(() => {
        router.clearCanActivate("route");
      }).not.toThrowError();
    });

    it("should allow re-registration after clearing", () => {
      router.canActivate("route", true);

      const [, activateFunctionsBefore] = router.getLifecycleFunctions();
      const oldFn = activateFunctionsBefore.get("route");

      router.clearCanActivate("route");

      router.canActivate("route", false);

      const [, activateFunctionsAfter] = router.getLifecycleFunctions();
      const newFn = activateFunctionsAfter.get("route");

      expect(newFn).toBeDefined();
      expect(newFn).not.toBe(oldFn);

      // New function should return false
      expect(
        newFn!(
          { name: "test", path: "/test", params: {} },
          undefined,
          () => {},
        ),
      ).toBe(false);
    });

    it("should handle clearing multiple different routes", () => {
      router.canActivate("route1", true);
      router.canActivate("route2", true);
      router.canActivate("route3", true);

      router.clearCanActivate("route1");
      router.clearCanActivate("route2");
      router.clearCanActivate("route3");

      const [, activateFunctions] = router.getLifecycleFunctions();

      expect(activateFunctions.get("route1")).toBe(undefined);
      expect(activateFunctions.get("route2")).toBe(undefined);
      expect(activateFunctions.get("route3")).toBe(undefined);
    });
  });
});
