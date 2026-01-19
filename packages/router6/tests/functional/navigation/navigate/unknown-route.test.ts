import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes, constants } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;

describe("router.navigate() - unknown route", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation to UNKNOWN_ROUTE", () => {
    beforeEach(() => {
      const routes = [
        { name: "orders", path: "/orders" },
        { name: "orders.pending", path: "/pending" },
        { name: "profile", path: "/profile" },
        { name: "settings", path: "/settings" },
      ];

      router = createRouter(routes, {
        allowNotFound: true, // Enable UNKNOWN_ROUTE behavior
      });

      router.start();
    });

    it("should call canDeactivate when transitioning FROM UNKNOWN_ROUTE", () => {
      const canDeactivateGuard = vi.fn().mockReturnValue(true);
      const canActivateGuard = vi.fn().mockReturnValue(true);

      const freshRouter = createRouter(
        [{ name: "profile", path: "/profile" }],
        { allowNotFound: true },
      );

      freshRouter.canActivate("profile", () => canActivateGuard);
      freshRouter.canDeactivate(
        constants.UNKNOWN_ROUTE,
        () => canDeactivateGuard,
      );

      // Start with unknown path
      freshRouter.start("/unknown-start-path");

      // UNKNOWN_ROUTE should now be set as current state
      expect(freshRouter.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(freshRouter.getState()?.path).toBe("/unknown-start-path");

      canActivateGuard.mockClear();
      canDeactivateGuard.mockClear();

      // Navigate away from UNKNOWN_ROUTE
      freshRouter.navigate("profile", (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("profile");

        // canDeactivate SHOULD be called when leaving UNKNOWN_ROUTE (new correct behavior)
        expect(canDeactivateGuard).toHaveBeenCalledTimes(1);

        // canActivate should be called for normal route
        expect(canActivateGuard).toHaveBeenCalledTimes(1);
      });
    });

    it("should handle middleware when transitioning TO normal route after UNKNOWN_ROUTE", () => {
      const middleware = vi.fn().mockReturnValue(true);

      const freshRouter = createRouter([{ name: "orders", path: "/orders" }], {
        allowNotFound: true,
      });

      freshRouter.useMiddleware(() => middleware);

      // Start with UNKNOWN_ROUTE
      freshRouter.start("/unknown-middleware-test");

      middleware.mockClear();

      // Navigate to normal route
      freshRouter.navigate("orders", {}, {}, (err) => {
        expect(err).toBeUndefined();

        // Middleware should be called for normal navigation
        expect(middleware).toHaveBeenCalledTimes(1);
      });
    });

    it("should use makeNotFoundState directly to create UNKNOWN_ROUTE", () => {
      const canActivateGuard = vi.fn().mockReturnValue(true);

      // Set up guard (should not be called)
      router.canActivate(constants.UNKNOWN_ROUTE, () => canActivateGuard);

      // Create UNKNOWN_ROUTE state directly
      const unknownState = router.makeNotFoundState("/direct-unknown-path", {
        replace: true,
      });

      expect(unknownState.name).toBe(constants.UNKNOWN_ROUTE);
      expect(unknownState.params.path).toBe("/direct-unknown-path");
      expect(unknownState.path).toBe("/direct-unknown-path");

      // Manually set state to test guard behavior
      router.setState(unknownState);

      // Navigate away to trigger lifecycle
      router.navigate("profile", {}, {}, () => {
        // canActivate should not have been called for UNKNOWN_ROUTE
        expect(canActivateGuard).not.toHaveBeenCalled();
      });
    });

    it("should handle blocked transitions from existing route when allowNotFound disabled", () => {
      // Test without allowNotFound to see normal ROUTE_NOT_FOUND behavior
      const strictRouter = createRouter(
        [
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
        ],
        { allowNotFound: false },
      );

      strictRouter.start("/settings");

      strictRouter.navigate("profile");

      // Try to navigate to non-existent route
      strictRouter.navigate("non-existent", {}, {}, (err) => {
        expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      // Should stay on current route
      expect(strictRouter.getState()?.name).toBe("profile");
    });
  });
});
