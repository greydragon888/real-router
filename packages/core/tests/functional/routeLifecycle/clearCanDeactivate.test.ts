import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  createLifecycleTestRouter,
  errorCodes,
  noop,
  type Router,
} from "./setup";

let router: Router;

describe("core/route-lifecycle/clearCanDeactivate", () => {
  beforeEach(() => {
    router = createLifecycleTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("should remove registered canDeactivate handler", () => {
    router.canDeactivate("users", false);

    expect(router.getLifecycleFunctions()[0].get("users")).toBeDefined();

    router.clearCanDeactivate("users");

    expect(router.getLifecycleFunctions()[0].get("users")).toBe(undefined);
  });

  it("should allow navigation after clearing a blocking canDeactivate", () => {
    router.canDeactivate("users.list", false);

    router.navigate("users.list");

    router.navigate("users", (err1) => {
      expect(err1?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
    });

    router.clearCanDeactivate("users.list");

    router.navigate("users", (err2) => {
      expect(err2).toBe(undefined);
    });

    expect(router.getState()?.name).toBe("users");
  });

  describe("validation and edge cases", () => {
    it("should return router instance for method chaining (fluent interface)", () => {
      router.canDeactivate("route1", true);

      const result = router.clearCanDeactivate("route1");

      expect(result).toBe(router);
    });

    it("should throw TypeError for invalid route names", () => {
      // Whitespace-only (empty string is valid root node)
      expect(() => {
        router.clearCanDeactivate("   ");
      }).toThrowError(TypeError);

      // Route name with spaces
      expect(() => {
        router.clearCanDeactivate("route name");
      }).toThrowError(TypeError);

      // Route name starting with number
      expect(() => {
        router.clearCanDeactivate("1route");
      }).toThrowError(TypeError);

      // Route name with special characters
      expect(() => {
        router.clearCanDeactivate("route#name");
      }).toThrowError(TypeError);

      // Route name ending with dot
      expect(() => {
        router.clearCanDeactivate("route.");
      }).toThrowError(TypeError);

      // Consecutive dots
      expect(() => {
        router.clearCanDeactivate("route..name");
      }).toThrowError(TypeError);
    });

    it("should handle very long route names correctly", () => {
      const longButValidName = "a".repeat(10_000);

      router.canDeactivate(longButValidName, true);

      expect(() => {
        router.clearCanDeactivate(longButValidName);
      }).not.toThrowError();

      const tooLongName = "a".repeat(10_001);

      expect(() => {
        router.clearCanDeactivate(tooLongName);
      }).toThrowError(TypeError);
    });

    it("should work with system routes with @@ prefix", () => {
      router.canDeactivate("@@notFound", true);

      expect(() => {
        router.clearCanDeactivate("@@notFound");
      }).not.toThrowError();

      const [deactivateFns] = router.getLifecycleFunctions();

      expect(deactivateFns.get("@@notFound")).toBe(undefined);
    });

    it("should work with nested route names", () => {
      router.canDeactivate("users.profile.settings", true);

      const [deactivateFnsBefore] = router.getLifecycleFunctions();

      expect(deactivateFnsBefore.get("users.profile.settings")).toBeDefined();

      router.clearCanDeactivate("users.profile.settings");

      const [deactivateFnsAfter] = router.getLifecycleFunctions();

      expect(deactivateFnsAfter.get("users.profile.settings")).toBe(undefined);
    });
  });

  describe("warning behavior", () => {
    it("should log warning when handler not found", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.clearCanDeactivate("nonExistentRoute");

      // Logger format: logger.warn(context, message)
      expect(warnSpy).toHaveBeenCalledWith(
        "router.clearCanDeactivate",
        expect.stringContaining("No canDeactivate handler found"),
      );

      warnSpy.mockRestore();
    });

    it("should not log warning when handler exists and is deleted", () => {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      router.canDeactivate("existingRoute", true);

      // Clear the spy calls from registration
      warnSpy.mockClear();

      router.clearCanDeactivate("existingRoute");

      // Should not have any calls with "No canDeactivate handler found"
      const notFoundWarnings = warnSpy.mock.calls.filter((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            arg.includes("No canDeactivate handler found"),
        ),
      );

      expect(notFoundWarnings).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe("dual deletion from maps", () => {
    it("should remove handler from both factories and functions maps", () => {
      router.canDeactivate("route", true);

      const [deactivateFactoriesBefore] = router.getLifecycleFactories();
      const [deactivateFunctionsBefore] = router.getLifecycleFunctions();

      expect(deactivateFactoriesBefore.route).toBeDefined();
      expect(deactivateFunctionsBefore.get("route")).toBeDefined();

      router.clearCanDeactivate("route");

      const [deactivateFactoriesAfter] = router.getLifecycleFactories();
      const [deactivateFunctionsAfter] = router.getLifecycleFunctions();

      expect(deactivateFactoriesAfter.route).toBe(undefined);
      expect(deactivateFunctionsAfter.get("route")).toBe(undefined);
    });

    it("should handle case when only factory exists (edge case)", () => {
      // This is a theoretical edge case where maps are out of sync
      router.canDeactivate("route", true);

      // Manually clear only functions (simulating inconsistent state)
      const [deactivateFunctions] = router.getLifecycleFunctions();

      deactivateFunctions.delete("route");

      // Should still clear factory without error
      expect(() => {
        router.clearCanDeactivate("route");
      }).not.toThrowError();

      const [deactivateFactoriesAfter] = router.getLifecycleFactories();

      expect(deactivateFactoriesAfter.route).toBe(undefined);
    });
  });

  describe("self-modification protection", () => {
    it("should throw Error if factory tries to clear itself via clearCanDeactivate", () => {
      expect(() => {
        router.canDeactivate("selfClear", (r) => {
          // Attempt to clear ourselves during factory compilation
          r.clearCanDeactivate("selfClear", true);

          return () => true;
        });
      }).toThrowError(
        /Cannot modify route "selfClear" during its own registration/,
      );

      // Guard should NOT be registered due to error
      const [deactivateFns] = router.getLifecycleFunctions();

      expect(deactivateFns.get("selfClear")).toBe(undefined);
    });
  });

  describe("multiple operations", () => {
    it("should be idempotent - safe to call multiple times", () => {
      router.canDeactivate("route", true);

      router.clearCanDeactivate("route");

      // Should not throw when clearing already cleared route
      expect(() => {
        router.clearCanDeactivate("route");
      }).not.toThrowError();

      // Third time for good measure
      expect(() => {
        router.clearCanDeactivate("route");
      }).not.toThrowError();
    });

    it("should allow re-registration after clearing", () => {
      router.canDeactivate("route", true);

      const [functionsBefore] = router.getLifecycleFunctions();
      const oldFn = functionsBefore.get("route");

      router.clearCanDeactivate("route");

      router.canDeactivate("route", false);

      const [functionsAfter] = router.getLifecycleFunctions();
      const newFn = functionsAfter.get("route");

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
      router.canDeactivate("route1", true);
      router.canDeactivate("route2", true);
      router.canDeactivate("route3", true);

      router.clearCanDeactivate("route1");
      router.clearCanDeactivate("route2");
      router.clearCanDeactivate("route3");

      const [functions] = router.getLifecycleFunctions();

      expect(functions.get("route1")).toBe(undefined);
      expect(functions.get("route2")).toBe(undefined);
      expect(functions.get("route3")).toBe(undefined);
    });
  });
});
