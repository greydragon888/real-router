import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes, constants } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - unknown route", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation to UNKNOWN_ROUTE", () => {
    beforeEach(() => {
      const routes = [
        {
          name: "orders",
          path: "/orders",
          children: [{ name: "pending", path: "/pending" }],
        },
        { name: "profile", path: "/profile" },
        { name: "settings", path: "/settings" },
      ];

      router = createRouter(routes, {
        allowNotFound: true, // Enable UNKNOWN_ROUTE behavior
      });

      router.start("/home").catch(() => {});
    });

    it("should call canDeactivate when transitioning FROM UNKNOWN_ROUTE", async () => {
      const canDeactivateGuard = vi.fn().mockReturnValue(true);
      const canActivateGuard = vi.fn().mockReturnValue(true);

      const freshRouter = createRouter(
        [{ name: "profile", path: "/profile" }],
        { allowNotFound: true },
      );

      getLifecycleApi(freshRouter).addActivateGuard(
        "profile",
        () => canActivateGuard,
      );
      getLifecycleApi(freshRouter).addDeactivateGuard(
        constants.UNKNOWN_ROUTE,
        () => canDeactivateGuard,
      );

      // Start with unknown path
      await freshRouter.start("/unknown-start-path");

      // UNKNOWN_ROUTE should now be set as current state
      expect(freshRouter.getState()?.name).toBe(constants.UNKNOWN_ROUTE);
      expect(freshRouter.getState()?.path).toBe("/unknown-start-path");

      canActivateGuard.mockClear();
      canDeactivateGuard.mockClear();

      // Navigate away from UNKNOWN_ROUTE
      const state = await freshRouter.navigate("profile");

      expect(state.name).toBe("profile");

      // canDeactivate SHOULD be called when leaving UNKNOWN_ROUTE (new correct behavior)
      expect(canDeactivateGuard).toHaveBeenCalledTimes(1);

      // canActivate should be called for normal route
      expect(canActivateGuard).toHaveBeenCalledTimes(1);
    });

    it("should handle plugin when transitioning TO normal route after UNKNOWN_ROUTE", async () => {
      const middleware = vi.fn();

      const freshRouter = createRouter([{ name: "orders", path: "/orders" }], {
        allowNotFound: true,
      });

      freshRouter.usePlugin(() => ({
        onTransitionSuccess: () => {
          middleware();
        },
      }));

      // Start with UNKNOWN_ROUTE
      await freshRouter.start("/unknown-middleware-test");

      middleware.mockClear();

      // Navigate to normal route
      await freshRouter.navigate("orders", {});

      expect(middleware).toHaveBeenCalledTimes(1);
    });

    it("should force replace: true when navigating FROM UNKNOWN_ROUTE", async () => {
      const onTransitionSuccess = vi.fn();

      const freshRouter = createRouter(
        [{ name: "profile", path: "/profile" }],
        { allowNotFound: true },
      );

      freshRouter.usePlugin(() => ({ onTransitionSuccess }));

      await freshRouter.start("/unknown-path");

      expect(freshRouter.getState()?.name).toBe(constants.UNKNOWN_ROUTE);

      onTransitionSuccess.mockClear();

      await freshRouter.navigate("profile");

      expect(onTransitionSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: "profile" }),
        expect.objectContaining({ name: constants.UNKNOWN_ROUTE }),
        expect.objectContaining({ replace: true }),
      );
    });

    it("should force replace: true even when not explicitly passed", async () => {
      const onTransitionSuccess = vi.fn();

      const freshRouter = createRouter(
        [{ name: "profile", path: "/profile" }],
        { allowNotFound: true },
      );

      freshRouter.usePlugin(() => ({ onTransitionSuccess }));

      await freshRouter.start("/unknown-path");

      onTransitionSuccess.mockClear();

      await freshRouter.navigate("profile", {}, {});

      expect(onTransitionSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ replace: true }),
      );
    });

    it("should NOT force replace when navigating from a normal route", async () => {
      const onTransitionSuccess = vi.fn();

      const freshRouter = createRouter(
        [
          { name: "home", path: "/home" },
          { name: "profile", path: "/profile" },
        ],
        { allowNotFound: true },
      );

      freshRouter.usePlugin(() => ({ onTransitionSuccess }));

      await freshRouter.start("/home");

      onTransitionSuccess.mockClear();

      await freshRouter.navigate("profile");

      const navOpts = onTransitionSuccess.mock.calls[0][2];

      expect(navOpts.replace).toBeUndefined();
    });

    it("should handle blocked transitions from existing route when allowNotFound disabled", async () => {
      // Test without allowNotFound to see normal ROUTE_NOT_FOUND behavior
      const strictRouter = createRouter(
        [
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
        ],
        { allowNotFound: false },
      );

      await strictRouter.start("/settings");

      await strictRouter.navigate("profile");

      // Try to navigate to non-existent route
      try {
        await strictRouter.navigate("non-existent", {});
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      // Should stay on current route
      expect(strictRouter.getState()?.name).toBe("profile");
    });
  });
});
