import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - guards can deactivate", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("canDeactivate logic", () => {
    describe("call canDeactivate when fromState is passed and forceDeactivate is not set", () => {
      it("should call canDeactivate handlers when fromState is provided", async () => {
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);
        const pendingDeactivateGuard = vi.fn().mockReturnValue(true);

        // Set up canDeactivate handlers
        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);
        router.addDeactivateGuard(
          "orders.pending",
          () => pendingDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending");

        // Clear spy calls from initial navigation
        ordersDeactivateGuard.mockClear();
        pendingDeactivateGuard.mockClear();

        // Navigate with explicit fromState (current state) - should call canDeactivate
        await router.navigate("profile");

        // canDeactivate should be called for both segments
        expect(pendingDeactivateGuard).toHaveBeenCalledTimes(1);
        expect(ordersDeactivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should call canDeactivate for nested routes correctly", async () => {
        const settingsDeactivateGuard = vi.fn().mockReturnValue(true);
        const accountDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.account",
          () => accountDeactivateGuard,
        );

        // Navigate to nested route
        await router.navigate("settings.account");

        settingsDeactivateGuard.mockClear();
        accountDeactivateGuard.mockClear();

        // Navigate away with explicit fromState
        await router.navigate("home");

        expect(accountDeactivateGuard).toHaveBeenCalledTimes(1);
        expect(settingsDeactivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should respect canDeactivate blocking transition", async () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false); // Block transition

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        const state1 = await router.navigate("orders.pending");

        expect(state1).toBeDefined();

        blockingDeactivateGuard.mockClear();

        // Try to navigate away - should be blocked
        try {
          await router.navigate("profile");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(blockingDeactivateGuard).toHaveBeenCalledTimes(1);
        }
      });
    });

    describe("bypass canDeactivate when forceDeactivate is true", () => {
      it("should NOT call canDeactivate handlers when forceDeactivate is true", async () => {
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);
        const pendingDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);
        router.addDeactivateGuard(
          "orders.pending",
          () => pendingDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending");

        ordersDeactivateGuard.mockClear();
        pendingDeactivateGuard.mockClear();

        // Navigate with forceDeactivate - should NOT call canDeactivate
        await router.navigate("profile", {}, { forceDeactivate: true });

        expect(pendingDeactivateGuard).not.toHaveBeenCalled();
        expect(ordersDeactivateGuard).not.toHaveBeenCalled();
      });

      it("should bypass blocking guards when forceDeactivate is true", async () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false); // Would block

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        await router.navigate("orders.pending");

        blockingDeactivateGuard.mockClear();

        // Navigate with forceDeactivate - should succeed without calling guard
        await router.navigate("profile", {}, { forceDeactivate: true });

        expect(blockingDeactivateGuard).not.toHaveBeenCalled(); // Guard bypassed
      });

      it("should bypass all nested guards with forceDeactivate", async () => {
        const settingsDeactivateGuard = vi.fn().mockReturnValue(false); // Would block
        const privacyDeactivateGuard = vi.fn().mockReturnValue(false); // Would block

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.privacy",
          () => privacyDeactivateGuard,
        );

        await router.navigate("settings.privacy");

        settingsDeactivateGuard.mockClear();
        privacyDeactivateGuard.mockClear();

        // Navigate with forceDeactivate - should bypass all guards
        await router.navigate("home", {}, { forceDeactivate: true });

        expect(privacyDeactivateGuard).not.toHaveBeenCalled();
        expect(settingsDeactivateGuard).not.toHaveBeenCalled();
      });
    });

    describe("normal navigation behavior (corrected understanding)", () => {
      it("should call canDeactivate handlers in normal navigation", async () => {
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);
        const pendingDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);
        router.addDeactivateGuard(
          "orders.pending",
          () => pendingDeactivateGuard,
        );

        // Navigate to initial state
        await router.navigate("orders.pending");

        ordersDeactivateGuard.mockClear();
        pendingDeactivateGuard.mockClear();

        // Normal navigation - SHOULD call canDeactivate (because fromState exists)
        await router.navigate("profile");

        expect(pendingDeactivateGuard).toHaveBeenCalledTimes(1);
        expect(ordersDeactivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should respect blocking guards in normal navigation", async () => {
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false); // Blocks transition

        router.addDeactivateGuard(
          "orders.pending",
          () => blockingDeactivateGuard,
        );

        const state1 = await router.navigate("orders.pending");

        expect(state1).toBeDefined();

        blockingDeactivateGuard.mockClear();

        // Normal navigation - should be blocked by guard
        try {
          await router.navigate("profile");

          expect.fail("Should have thrown");
        } catch (error: any) {
          // Should be blocked
          expect(error?.code).toBe(errorCodes.CANNOT_DEACTIVATE);
          expect(blockingDeactivateGuard).toHaveBeenCalledTimes(1);
        }
      });

      it("should handle nested routes correctly in normal navigation", async () => {
        const settingsDeactivateGuard = vi.fn().mockReturnValue(true);
        const accountDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.account",
          () => accountDeactivateGuard,
        );

        await router.navigate("settings.account");

        settingsDeactivateGuard.mockClear();
        accountDeactivateGuard.mockClear();

        // Normal navigation - should call nested guards
        await router.navigate("home");

        expect(accountDeactivateGuard).toHaveBeenCalledTimes(1);
        expect(settingsDeactivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should verify that forceDeactivate: false calls guards normally", async () => {
        const deactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("orders.pending", () => deactivateGuard);

        await router.navigate("orders.pending");

        deactivateGuard.mockClear();

        // Explicitly set forceDeactivate: false - should call guards normally
        await router.navigate("profile", {}, { forceDeactivate: false });

        expect(deactivateGuard).toHaveBeenCalledTimes(1);
      });

      it("should only skip guards on very first navigation (no current state)", async () => {
        const profileDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("profile", () => profileDeactivateGuard);

        // Navigate to a different state first (not home, to avoid SAME_STATES)
        await router.navigate("profile");

        expect(profileDeactivateGuard).not.toHaveBeenCalled(); // No fromState yet

        profileDeactivateGuard.mockClear();

        // Second navigation - now has fromState, should call deactivate
        await router.navigate("orders");

        expect(profileDeactivateGuard).toHaveBeenCalledTimes(1); // Now called
      });
    });

    describe("edge cases", () => {
      it("should handle combination of fromState and forceDeactivate correctly", async () => {
        const deactivateGuard = vi.fn().mockReturnValue(false); // Would block normally

        router.addDeactivateGuard("orders.pending", () => deactivateGuard);

        await router.navigate("orders.pending");

        deactivateGuard.mockClear();

        // Both fromState and forceDeactivate - should NOT call guard at all
        await router.navigate("profile", {}, { forceDeactivate: true });

        expect(deactivateGuard).not.toHaveBeenCalled(); // ✅ Guard bypassed
      });

      it("should handle empty canDeactivate handlers gracefully", async () => {
        // No canDeactivate handlers set

        await router.navigate("orders.pending");

        // Should work fine even with fromState when no handlers are set
        await router.navigate("profile");
      });
    });
  });
});
