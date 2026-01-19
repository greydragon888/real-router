import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;

describe("router.navigate() - same states", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("same states navigation", () => {
    describe("same states without reload and force", () => {
      it("should return SAME_STATES error when navigating to same state twice", () => {
        // First navigation - should succeed
        router.navigate("orders.pending", {}, {}, (err1, state1) => {
          expect(err1).toBeUndefined();
          expect(state1?.name).toBe("orders.pending");
        });

        // Second navigation to same state - should fail
        router.navigate("orders.pending", {}, {}, (err2) => {
          expect(err2?.code).toBe(errorCodes.SAME_STATES);
        });
      });

      it("should handle same states with different parameter values", () => {
        // Navigate to profile with param
        router.navigate("profile", { userId: "123" }, {}, (err1, state1) => {
          expect(err1).toBeUndefined();
          expect(state1?.name).toBe("profile");
          expect(state1?.params).toStrictEqual({ userId: "123" });
        });

        // Navigate to same route with same param - should fail
        router.navigate("profile", { userId: "123" }, {}, (err2) => {
          expect(err2?.code).toBe(errorCodes.SAME_STATES);
        });
      });

      it("should allow navigation to same route with different parameters", () => {
        // Navigate to profile with param
        router.navigate("profile", { userId: "123" }, {}, (err1, state1) => {
          expect(err1).toBeUndefined();
          expect(state1?.name).toBe("profile");
          expect(state1?.params).toStrictEqual({ userId: "123" });
        });
        // Navigate to same route with different param - should succeed
        router.navigate("profile", { userId: "456" }, {}, (err2, state2) => {
          expect(err2).toBeUndefined();
          expect(state2?.name).toBe("profile");
          expect(state2?.params).toStrictEqual({ userId: "456" });
        });
      });
    });

    describe("same states with reload: true", () => {
      it("should navigate to same state if reload is set to true", () => {
        // First navigation
        router.navigate("orders.pending", {}, {}, (err1, state1) => {
          expect(err1).toBeUndefined();

          expect(state1?.name).toBe("orders.pending");
        });

        // Second navigation with reload - should succeed
        router.navigate(
          "orders.pending",
          {},
          { reload: true },
          (err2, state2) => {
            expect(err2).toBeUndefined();

            expect(state2?.name).toBe("orders.pending");
          },
        );
      });

      it("should trigger all lifecycle events on reload", () => {
        const canDeactivateGuard = vi.fn().mockReturnValue(true);
        const canActivateGuard = vi.fn().mockReturnValue(true);

        router.canDeactivate("orders.pending", () => canDeactivateGuard);
        router.canActivate("orders.pending", () => canActivateGuard);

        // First navigation
        router.navigate("orders.pending", {}, {}, () => {
          expect(canActivateGuard).toHaveBeenCalledTimes(1);
        });

        // Reset spies
        canDeactivateGuard.mockClear();
        canActivateGuard.mockClear();

        // Second navigation with reload - should call guards again
        router.navigate("orders.pending", {}, { reload: true }, () => {
          expect(canDeactivateGuard).toHaveBeenCalledTimes(1);
          expect(canActivateGuard).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe("same states with force: true", () => {
      it("should force navigation to same state if force option is set", () => {
        // First navigation
        router.navigate("orders.pending", {}, {}, (err1, state1) => {
          expect(err1).toBeUndefined();

          expect(state1?.name).toBe("orders.pending");
        });

        // Second navigation with force - should succeed
        router.navigate(
          "orders.pending",
          {},
          { force: true },
          (err2, state2) => {
            expect(err2).toBeUndefined();

            expect(state2?.name).toBe("orders.pending");
          },
        );
      });

      it("should bypass guards when force is true", () => {
        const canDeactivateSpy = vi.fn().mockReturnValue(false); // Block deactivation

        router.canDeactivate("orders.pending", () => canDeactivateSpy);

        // First navigation
        router.navigate("orders.pending", {}, {}, () => {
          canDeactivateSpy.mockClear();
        });

        // Second navigation with force - should bypass guard
        router.navigate("orders.pending", {}, { force: true }, (err) => {
          expect(err).toBeUndefined();

          // Guard should not be called with force
          expect(canDeactivateSpy).not.toHaveBeenCalled();
        });
      });

      it("should work with both force and reload options", () => {
        router.navigate("orders.pending", {}, {}, (err1, state1) => {
          expect(err1).toBeUndefined();

          expect(state1?.name).toBe("orders.pending");
        });

        // Both force and reload
        router.navigate(
          "orders.pending",
          {},
          { force: true, reload: true },
          (err2, state2) => {
            expect(err2).toBeUndefined();

            expect(state2?.name).toBe("orders.pending");
          },
        );
      });
    });

    describe("Edge cases", () => {
      it("should handle complex nested routes correctly", () => {
        router.navigate("orders.pending", {}, {});

        // Same nested route - should fail
        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.SAME_STATES);
        });
      });

      it("should compare states including meta information", () => {
        // First navigate with options
        router.navigate("profile", {}, { replace: true });

        // Second navigate with different options but same route
        router.navigate("profile", {}, { replace: false }, (err) => {
          // Should still be considered same state (options don't affect state comparison)
          expect(err?.code).toBe(errorCodes.SAME_STATES);
        });
      });
    });
  });
});
