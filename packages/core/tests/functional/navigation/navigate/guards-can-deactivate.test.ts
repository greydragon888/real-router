import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - guards can deactivate", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("canDeactivate logic", () => {
    describe("call canDeactivate when fromState is passed and forceDeactivate is not set", () => {
      it("should call canDeactivate handlers when fromState is provided", () => {
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);
        const pendingDeactivateGuard = vi.fn().mockReturnValue(true);

        // Set up canDeactivate handlers
        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);
        router.addDeactivateGuard(
          "orders.pending",
          () => pendingDeactivateGuard,
        );

        // Navigate to initial state
        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Clear spy calls from initial navigation
          ordersDeactivateGuard.mockClear();
          pendingDeactivateGuard.mockClear();
        });

        // Navigate with explicit fromState (current state) - should call canDeactivate
        router.navigate("profile", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // canDeactivate should be called for both segments
          expect(pendingDeactivateGuard).toHaveBeenCalledTimes(1);
          expect(ordersDeactivateGuard).toHaveBeenCalledTimes(1);

          // Check call order (child first, then parent)
          expect(pendingDeactivateGuard).toHaveBeenCalledWith(
            expect.objectContaining({ name: "profile" }), // toState
            expect.objectContaining({ name: "orders.pending" }), // fromState
            expect.any(Function),
          );
          expect(ordersDeactivateGuard).toHaveBeenCalledWith(
            expect.objectContaining({ name: "profile" }), // toState
            expect.objectContaining({ name: "orders.pending" }), // fromState
            expect.any(Function),
          );
        });
      });

      it("should call canDeactivate for nested routes correctly", () => {
        const settingsDeactivateGuard = vi.fn().mockReturnValue(true);
        const accountDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.account",
          () => accountDeactivateGuard,
        );

        // Navigate to nested route
        router.navigate("settings.account", {}, {}, (err) => {
          expect(err).toBeUndefined();

          settingsDeactivateGuard.mockClear();
          accountDeactivateGuard.mockClear();

          // Navigate away with explicit fromState
          router.navigate("home", {}, {}, (err) => {
            expect(err).toBeUndefined();

            expect(accountDeactivateGuard).toHaveBeenCalledTimes(1);
            expect(settingsDeactivateGuard).toHaveBeenCalledTimes(1);
          });
        });
      });

      it("should respect canDeactivate blocking transition", () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false); // Block transition

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          blockingDeactivateGuard.mockClear();

          // Try to navigate away - should be blocked
          router.navigate("profile", {}, {}, (err) => {
            expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
            expect(blockingDeactivateGuard).toHaveBeenCalledTimes(1);
          });
        });
      });
    });

    describe("bypass canDeactivate when forceDeactivate is true", () => {
      it("should NOT call canDeactivate handlers when forceDeactivate is true", () => {
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);
        const pendingDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);
        router.addDeactivateGuard(
          "orders.pending",
          () => pendingDeactivateGuard,
        );

        // Navigate to initial state
        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();
        });

        ordersDeactivateGuard.mockClear();
        pendingDeactivateGuard.mockClear();

        // Navigate with forceDeactivate - should NOT call canDeactivate
        router.navigate("profile", {}, { forceDeactivate: true }, (err) => {
          expect(err).toBeUndefined();

          expect(pendingDeactivateGuard).not.toHaveBeenCalled();
          expect(ordersDeactivateGuard).not.toHaveBeenCalled();
        });
      });

      it("should bypass blocking guards when forceDeactivate is true", () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false); // Would block

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();
        });

        blockingDeactivateGuard.mockClear();

        // Navigate with forceDeactivate - should succeed without calling guard
        router.navigate("profile", {}, { forceDeactivate: true }, (err) => {
          expect(err).toBeUndefined(); // Success despite blocking guard
          expect(blockingDeactivateGuard).not.toHaveBeenCalled(); // Guard bypassed
        });
      });

      it("should bypass all nested guards with forceDeactivate", () => {
        const settingsDeactivateGuard = vi.fn().mockReturnValue(false); // Would block
        const privacyDeactivateGuard = vi.fn().mockReturnValue(false); // Would block

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.privacy",
          () => privacyDeactivateGuard,
        );

        router.navigate("settings.privacy", {}, {}, (err) => {
          expect(err).toBeUndefined();
        });

        settingsDeactivateGuard.mockClear();
        privacyDeactivateGuard.mockClear();

        // Navigate with forceDeactivate - should bypass all guards
        router.navigate("home", {}, { forceDeactivate: true }, (err) => {
          expect(err).toBeUndefined();

          expect(privacyDeactivateGuard).not.toHaveBeenCalled();
          expect(settingsDeactivateGuard).not.toHaveBeenCalled();
        });
      });
    });

    describe("normal navigation behavior (corrected understanding)", () => {
      it("should call canDeactivate handlers in normal navigation", () => {
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);
        const pendingDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);
        router.addDeactivateGuard(
          "orders.pending",
          () => pendingDeactivateGuard,
        );

        // Navigate to initial state
        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          ordersDeactivateGuard.mockClear();
          pendingDeactivateGuard.mockClear();

          // Normal navigation - SHOULD call canDeactivate (because fromState exists)
          router.navigate("profile", {}, {}, (err) => {
            expect(err).toBeUndefined();

            expect(pendingDeactivateGuard).toHaveBeenCalledTimes(1);
            expect(ordersDeactivateGuard).toHaveBeenCalledTimes(1);
          });
        });
      });

      it("should respect blocking guards in normal navigation", () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false); // Blocks transition

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          blockingDeactivateGuard.mockClear();

          // Normal navigation - should be blocked by guard
          router.navigate("profile", {}, {}, (err) => {
            // Should be blocked
            expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
            expect(blockingDeactivateGuard).toHaveBeenCalledTimes(1);
          });
        });
      });

      it("should handle nested routes correctly in normal navigation", () => {
        const settingsDeactivateGuard = vi.fn().mockReturnValue(true);
        const accountDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.account",
          () => accountDeactivateGuard,
        );

        router.navigate("settings.account", {}, {}, (err) => {
          expect(err).toBeUndefined();

          settingsDeactivateGuard.mockClear();
          accountDeactivateGuard.mockClear();

          // Normal navigation - should call nested guards
          router.navigate("home", {}, {}, (err) => {
            expect(err).toBeUndefined();

            expect(accountDeactivateGuard).toHaveBeenCalledTimes(1);
            expect(settingsDeactivateGuard).toHaveBeenCalledTimes(1);
          });
        });
      });

      it("should verify that forceDeactivate: false calls guards normally", () => {
        const deactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders.pending", () => deactivateGuard);

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          deactivateGuard.mockClear();

          // Explicitly set forceDeactivate: false - should call guards normally
          router.navigate("profile", {}, { forceDeactivate: false }, (err) => {
            expect(err).toBeUndefined();
            expect(deactivateGuard).toHaveBeenCalledTimes(1);
          });
        });
      });

      it("should only skip guards on very first navigation (no current state)", () => {
        const profileDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("profile", () => profileDeactivateGuard);

        // Navigate to a different state first (not home, to avoid SAME_STATES)
        router.navigate("profile", {}, {}, (err) => {
          expect(err).toBeUndefined();
          expect(profileDeactivateGuard).not.toHaveBeenCalled(); // No fromState yet
        });

        profileDeactivateGuard.mockClear();

        // Second navigation - now has fromState, should call deactivate
        router.navigate("orders", {}, {}, (err) => {
          expect(err).toBeUndefined();
          expect(profileDeactivateGuard).toHaveBeenCalledTimes(1); // Now called
        });
      });
    });

    describe("edge cases", () => {
      it("should handle combination of fromState and forceDeactivate correctly", () => {
        const deactivateGuard = vi.fn().mockReturnValue(false); // Would block normally

        router.addDeactivateGuard("orders.pending", () => deactivateGuard);

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();
        });

        deactivateGuard.mockClear();

        // Both fromState and forceDeactivate - should NOT call guard at all
        router.navigate(
          "profile",
          {},
          {
            forceDeactivate: true,
          },
          (err) => {
            expect(err).toBeUndefined(); // Should succeed
            expect(deactivateGuard).not.toHaveBeenCalled(); // ✅ Guard bypassed
          },
        );
      });

      it("should handle empty canDeactivate handlers gracefully", () => {
        // No canDeactivate handlers set

        router.navigate("orders.pending", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Should work fine even with fromState when no handlers are set
          router.navigate("profile", {}, {}, (err) => {
            expect(err).toBeUndefined();
          });
        });
      });
    });
  });
});
