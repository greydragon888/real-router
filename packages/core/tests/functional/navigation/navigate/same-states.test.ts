import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - same states", () => {
  beforeEach(() => {
    router = createTestRouter();

    void router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("same states navigation", () => {
    describe("same states without reload and force", () => {
      it("should return SAME_STATES error when navigating to same state twice", async () => {
        // First navigation - should succeed
        const state1 = await router.navigate("orders.pending");

        expect(state1?.name).toBe("orders.pending");

        // Second navigation to same state - should fail
        try {
          await router.navigate("orders.pending");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.SAME_STATES);
        }
      });

      it("should handle same states with different parameter values", async () => {
        // Navigate to profile with param
        const state1 = await router.navigate("profile", { userId: "123" });

        expect(state1?.name).toBe("profile");
        expect(state1?.params).toStrictEqual({ userId: "123" });

        // Navigate to same route with same param - should fail
        try {
          await router.navigate("profile", { userId: "123" });

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.SAME_STATES);
        }
      });

      it("should allow navigation to same route with different parameters", async () => {
        // Navigate to profile with param
        const state1 = await router.navigate("profile", { userId: "123" });

        expect(state1?.name).toBe("profile");
        expect(state1?.params).toStrictEqual({ userId: "123" });

        // Navigate to same route with different param - should succeed
        const state2 = await router.navigate("profile", { userId: "456" });

        expect(state2?.name).toBe("profile");
        expect(state2?.params).toStrictEqual({ userId: "456" });
      });
    });

    describe("same states with reload: true", () => {
      it("should navigate to same state if reload is set to true", async () => {
        // First navigation
        const err1 = await router.navigate("orders.pending");

        expect(err1).toBeUndefined();

        const state1 = router.getState();

        expect(state1?.name).toBe("orders.pending");

        // Second navigation with reload - should succeed
        const err2 = await router.navigate(
          "orders.pending",
          {},
          { reload: true },
        );

        expect(err2).toBeUndefined();

        const state2 = router.getState();

        expect(state2?.name).toBe("orders.pending");
      });

      it("should trigger all lifecycle events on reload", async () => {
        const canDeactivateGuard = vi.fn().mockReturnValue(true);
        const canActivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders.pending", () => canDeactivateGuard);
        router.addActivateGuard("orders.pending", () => canActivateGuard);

        // First navigation
        await router.navigate("orders.pending");

        expect(canActivateGuard).toHaveBeenCalledTimes(1);

        // Reset spies
        canDeactivateGuard.mockClear();
        canActivateGuard.mockClear();

        // Second navigation with reload - should call guards again
        await router.navigate("orders.pending", {}, { reload: true });

        expect(canDeactivateGuard).toHaveBeenCalledTimes(1);
        expect(canActivateGuard).toHaveBeenCalledTimes(1);
      });
    });

    describe("same states with force: true", () => {
      it("should force navigation to same state if force option is set", async () => {
        // First navigation
        const err1 = await router.navigate("orders.pending");

        expect(err1).toBeUndefined();

        const state1 = router.getState();

        expect(state1?.name).toBe("orders.pending");

        // Second navigation with force - should succeed
        const err2 = await router.navigate(
          "orders.pending",
          {},
          { force: true },
        );

        expect(err2).toBeUndefined();

        const state2 = router.getState();

        expect(state2?.name).toBe("orders.pending");
      });

      it("should bypass guards when force is true", async () => {
        const canDeactivateSpy = vi.fn().mockReturnValue(false); // Block deactivation

        router.addDeactivateGuard("orders.pending", () => canDeactivateSpy);

        // First navigation
        await router.navigate("orders.pending");
        canDeactivateSpy.mockClear();

        // Second navigation with force - should bypass guard
        const err = await router.navigate(
          "orders.pending",
          {},
          { force: true },
        );

        expect(err).toBeUndefined();

        // Guard should not be called with force
        expect(canDeactivateSpy).not.toHaveBeenCalled();
      });

      it("should work with both force and reload options", async () => {
        const err1 = await router.navigate("orders.pending");

        expect(err1).toBeUndefined();

        const state1 = router.getState();

        expect(state1?.name).toBe("orders.pending");

        // Both force and reload
        const err2 = await router.navigate(
          "orders.pending",
          {},
          { force: true, reload: true },
        );

        expect(err2).toBeUndefined();

        const state2 = router.getState();

        expect(state2?.name).toBe("orders.pending");
      });
    });

    describe("Edge cases", () => {
      it("should handle complex nested routes correctly", async () => {
        await router.navigate("orders.pending");

        // Same nested route - should fail
        try {
          await router.navigate("orders.pending");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.SAME_STATES);
        }
      });

      it("should compare states including meta information", async () => {
        // First navigate with options
        await router.navigate("profile", {}, { replace: true });

        // Second navigate with different options but same route
        try {
          await router.navigate("profile", {}, { replace: false });

          expect.fail("Should have thrown");
        } catch (error: any) {
          // Should still be considered same state (options don't affect state comparison)
          expect(error?.code).toBe(errorCodes.SAME_STATES);
        }
      });
    });
  });
});
