import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - guards can activate", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("canActivate for existing and non-existing routes", () => {
    describe("call canActivate when route exists", () => {
      it("should call canActivate handlers for existing route", () => {
        const ordersActivateGuard = vi.fn().mockReturnValue(true);
        const pendingActivateGuard = vi.fn().mockReturnValue(true);

        router.addActivateGuard("orders", () => ordersActivateGuard);
        router.addActivateGuard("orders.pending", () => pendingActivateGuard);

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          expect(ordersActivateGuard).toHaveBeenCalledTimes(1);
          expect(pendingActivateGuard).toHaveBeenCalledTimes(1);
        });
      });

      it("should call canActivate handlers for nested existing routes", () => {
        const settingsActivateGuard = vi.fn().mockReturnValue(true);
        const profileActivateGuard = vi.fn().mockReturnValue(true);

        router.addActivateGuard("settings", () => settingsActivateGuard);
        router.addActivateGuard("settings.profile", () => profileActivateGuard);

        router.navigate("settings.profile", {}, {}, (err) => {
          expect(err).toBeUndefined();

          expect(settingsActivateGuard).toHaveBeenCalledTimes(1);
          expect(profileActivateGuard).toHaveBeenCalledTimes(1);
        });
      });

      it("should respect blocking canActivate guards", () => {
        const blockingActivateGuard = vi.fn().mockReturnValue(false);

        router.addActivateGuard("orders.pending", () => blockingActivateGuard);

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);

          expect(blockingActivateGuard).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe("do not call canActivate when route does not exist", () => {
      it("should not call canActivate handlers for non-existing route", () => {
        const nonExistentActivateGuard = vi.fn().mockReturnValue(true);

        router.addActivateGuard(
          "non.existent.route",
          () => nonExistentActivateGuard,
        );

        router.navigate("non.existent.route", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);

          expect(nonExistentActivateGuard).not.toHaveBeenCalled();
        });
      });

      it("should not call canActivate for partially non-existing nested routes", () => {
        const existingActivateGuard = vi.fn().mockReturnValue(true);
        const nonExistentActivateGuard = vi.fn().mockReturnValue(true);

        router.addActivateGuard("orders", () => existingActivateGuard);
        router.addActivateGuard(
          "orders.nonexistent",
          () => nonExistentActivateGuard,
        );

        router.navigate("orders.nonexistent", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);

          expect(existingActivateGuard).not.toHaveBeenCalled();
          expect(nonExistentActivateGuard).not.toHaveBeenCalled();
        });
      });

      it("should handle completely invalid route names", () => {
        const invalidActivateGuard = vi.fn().mockReturnValue(true);

        router.addActivateGuard(
          "totally.invalid.route.name",
          () => invalidActivateGuard,
        );

        router.navigate("totally.invalid.route.name", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);

          expect(invalidActivateGuard).not.toHaveBeenCalled();
        });
      });
    });
  });
});
