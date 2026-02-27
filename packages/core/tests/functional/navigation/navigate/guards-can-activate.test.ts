import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, LifecycleApi } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - guards can activate", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("canActivate for existing and non-existing routes", () => {
    describe("call canActivate when route exists", () => {
      it("should call canActivate handlers for existing route", async () => {
        const ordersActivateGuard = vi.fn().mockReturnValue(true);
        const pendingActivateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("orders", () => ordersActivateGuard);
        lifecycle.addActivateGuard(
          "orders.pending",
          () => pendingActivateGuard,
        );

        const state = await router.navigate("orders.pending");

        expect(state).toBeDefined();

        expect(ordersActivateGuard).toHaveBeenCalledTimes(1);
        expect(pendingActivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should call canActivate handlers for nested existing routes", async () => {
        const settingsActivateGuard = vi.fn().mockReturnValue(true);
        const profileActivateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("settings", () => settingsActivateGuard);
        lifecycle.addActivateGuard(
          "settings.profile",
          () => profileActivateGuard,
        );

        const state = await router.navigate("settings.profile");

        expect(state).toBeDefined();

        expect(settingsActivateGuard).toHaveBeenCalledTimes(1);
        expect(profileActivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should respect blocking canActivate guards", async () => {
        const blockingActivateGuard = vi.fn().mockReturnValue(false);

        lifecycle.addActivateGuard(
          "orders.pending",
          () => blockingActivateGuard,
        );

        try {
          await router.navigate("orders.pending");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_ACTIVATE);
          expect(blockingActivateGuard).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe("do not call canActivate when route does not exist", () => {
      it("should not call canActivate handlers for non-existing route", async () => {
        const nonExistentActivateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard(
          "non.existent.route",
          () => nonExistentActivateGuard,
        );

        try {
          await router.navigate("non.existent.route");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          expect(nonExistentActivateGuard).not.toHaveBeenCalled();
        }
      });

      it("should not call canActivate for partially non-existing nested routes", async () => {
        const existingActivateGuard = vi.fn().mockReturnValue(true);
        const nonExistentActivateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard("orders", () => existingActivateGuard);
        lifecycle.addActivateGuard(
          "orders.nonexistent",
          () => nonExistentActivateGuard,
        );

        try {
          await router.navigate("orders.nonexistent");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          expect(existingActivateGuard).not.toHaveBeenCalled();
          expect(nonExistentActivateGuard).not.toHaveBeenCalled();
        }
      });

      it("should handle completely invalid route names", async () => {
        const invalidActivateGuard = vi.fn().mockReturnValue(true);

        lifecycle.addActivateGuard(
          "totally.invalid.route.name",
          () => invalidActivateGuard,
        );

        try {
          await router.navigate("totally.invalid.route.name");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          expect(invalidActivateGuard).not.toHaveBeenCalled();
        }
      });
    });
  });
});
