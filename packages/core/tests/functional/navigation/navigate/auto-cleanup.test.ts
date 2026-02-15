import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import type { Router } from "@real-router/core";

const noop = () => undefined;

describe("router.navigate() - auto cleanup", () => {
  describe("navigation with options.autoCleanUp === true", () => {
    let router: Router;

    beforeEach(async () => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      router = createRouter(
        [
          { name: "home", path: "/" },
          {
            name: "users",
            path: "/users",
            children: [
              { name: "list", path: "/list" },
              { name: "view", path: "/view/:id" },
            ],
          },
          {
            name: "orders",
            path: "/orders",
            children: [
              { name: "pending", path: "/pending" },
              { name: "completed", path: "/completed" },
            ],
          },
          { name: "profile", path: "/profile" },
          {
            name: "settings",
            path: "/settings",
            children: [
              { name: "general", path: "/general" },
              { name: "account", path: "/account" },
            ],
          },
        ],
        {
          defaultRoute: "home",
        },
      );

      await router.start("/home");
    });

    afterEach(() => {
      router.stop();
    });

    /**
     * Helper to check if a canDeactivate guard exists for a route.
     * Uses overwrite warning detection: if guard exists, registering new one triggers warning.
     */
    function hasCanDeactivate(routeName: string): boolean {
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(noop);

      // Try to register a guard - if one exists, it will trigger overwrite warning
      router.addDeactivateGuard(routeName, true);

      const hadGuard = warnSpy.mock.calls.some(
        (call) =>
          call[0] === "router.canDeactivate" &&
          typeof call[1] === "string" &&
          call[1].includes("Overwriting"),
      );

      warnSpy.mockRestore();

      return hadGuard;
    }

    describe("basic autoCleanUp functionality", () => {
      it("should remove canDeactivate for previously active segments that become inactive", async () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first to establish a baseline
        await router.navigate("users");

        // Set up guards for routes
        router.addDeactivateGuard("users", () => usersDeactivateGuard);
        router.addDeactivateGuard("orders", () => ordersDeactivateGuard);

        expect(hasCanDeactivate("users")).toBe(true);
        expect(hasCanDeactivate("orders")).toBe(true);

        // Navigate to orders - users becomes inactive and should be cleaned up
        await router.navigate("orders");

        // users guard should be removed (was active, now inactive)
        expect(hasCanDeactivate("users")).toBe(false);
        // orders guard should remain (it's now active)
        expect(hasCanDeactivate("orders")).toBe(true);

        // Navigate back to users - orders becomes inactive
        await router.navigate("users");

        // orders guard should be removed
        expect(hasCanDeactivate("orders")).toBe(false);
      });

      it("should only clean up segments that are not in active path for nested routes", async () => {
        // Navigate to users first to establish baseline
        await router.navigate("users");

        // Set up guards
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const usersListDeactivateGuard = vi.fn().mockReturnValue(true);
        const usersViewDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("users", () => usersDeactivateGuard);
        router.addDeactivateGuard("users.list", () => usersListDeactivateGuard);
        router.addDeactivateGuard("users.view", () => usersViewDeactivateGuard);

        expect(hasCanDeactivate("users")).toBe(true);
        expect(hasCanDeactivate("users.list")).toBe(true);
        expect(hasCanDeactivate("users.view")).toBe(true);

        // Navigate to users.list
        await router.navigate("users.list");

        // Navigate to users.view (users remains active, but users.list becomes inactive)
        await router.navigate("users.view", { id: 123 });

        // users.list should be removed (was active, now inactive)
        expect(hasCanDeactivate("users.list")).toBe(false);

        // users should remain (still in active path)
        expect(hasCanDeactivate("users")).toBe(true);

        // users.view should remain (now active)
        expect(hasCanDeactivate("users.view")).toBe(true);
      });

      it("should handle complex nested route transitions correctly", async () => {
        // Navigate to users first
        await router.navigate("users");

        // Set up guards
        const settingsDeactivateGuard = vi.fn().mockReturnValue(true);
        const settingsGeneralDeactivateGuard = vi.fn().mockReturnValue(true);
        const settingsAccountDeactivateGuard = vi.fn().mockReturnValue(true);

        router.addDeactivateGuard("settings", () => settingsDeactivateGuard);
        router.addDeactivateGuard(
          "settings.general",
          () => settingsGeneralDeactivateGuard,
        );
        router.addDeactivateGuard(
          "settings.account",
          () => settingsAccountDeactivateGuard,
        );

        // Navigate through nested routes: settings.general -> settings.account -> users
        await router.navigate("settings.general");

        expect(hasCanDeactivate("settings")).toBe(true);
        expect(hasCanDeactivate("settings.general")).toBe(true);
        expect(hasCanDeactivate("settings.account")).toBe(true);

        // Navigate within settings hierarchy
        await router.navigate("settings.account");

        // settings.general should be removed (settings remains active)
        expect(hasCanDeactivate("settings.general")).toBe(false);
        expect(hasCanDeactivate("settings")).toBe(true);
        expect(hasCanDeactivate("settings.account")).toBe(true);

        // Navigate out of settings hierarchy completely
        await router.navigate("users");

        // All settings guards should be removed
        expect(hasCanDeactivate("settings")).toBe(false);
        expect(hasCanDeactivate("settings.account")).toBe(false);
      });
    });

    describe("autoCleanUp with transition errors", () => {
      it("should not remove canDeactivate when middleware blocks transition", async () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first (before adding blocking middleware)
        await router.navigate("users", {}, {});

        // Set up guard
        router.addDeactivateGuard("users", () => usersDeactivateGuard);

        expect(hasCanDeactivate("users")).toBe(true);

        // Add blocking middleware
        const blockingMiddleware = vi.fn().mockReturnValue(false);

        router.useMiddleware(() => blockingMiddleware);

        // Try to navigate away (should be blocked)
        try {
          await router.navigate("orders", {}, {});

          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as any)?.code).toBe(errorCodes.TRANSITION_ERR);
        }

        // Guard should NOT be removed (transition failed)
        expect(hasCanDeactivate("users")).toBe(true);
      });

      it("should not remove canDeactivate when canActivate blocks transition", async () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const blockingActivateGuard = vi.fn().mockReturnValue(false);

        router.addDeactivateGuard("users", () => usersDeactivateGuard);
        router.addActivateGuard("profile", () => blockingActivateGuard);

        await router.navigate("users", {}, {});

        expect(hasCanDeactivate("users")).toBe(true);

        try {
          await router.navigate("profile", {}, {});

          expect.fail("Should have thrown error");
        } catch (error) {
          expect((error as any)?.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }

        // Guard should NOT be removed (transition failed)
        expect(hasCanDeactivate("users")).toBe(true);
      });

      it.todo(
        "should not remove canDeactivate when canDeactivate blocks transition (TODO: fix guard blocking)",
        async () => {
          const normalDeactivateGuard = vi.fn().mockReturnValue(true);

          // Navigate to users first with normal guard
          router.addDeactivateGuard("users", () => normalDeactivateGuard);

          await router.navigate("users");

          // Replace with blocking guard that returns false
          const blockingDeactivateGuard = vi.fn().mockReturnValue(false);

          router.addDeactivateGuard("users", () => blockingDeactivateGuard);

          expect(hasCanDeactivate("users")).toBe(true);

          // Try to navigate away (should be blocked)
          await expect(router.navigate("orders")).rejects.toMatchObject({
            code: errorCodes.CANNOT_DEACTIVATE,
          });

          // Guard should NOT be removed (transition failed)
          expect(hasCanDeactivate("users")).toBe(true);
        },
      );
    });

    describe("autoCleanUp edge cases", () => {
      it("should handle navigation when no canDeactivate guards are set", async () => {
        // No guards set - just verify navigation works
        await router.navigate("users", {}, {});

        await router.navigate("orders", {}, {});

        // No guards to check - just verify no errors
        expect(router.getState()?.name).toBe("orders");
      });

      it("should not remove guard when navigating to same route", async () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);

        await router.navigate("users", {}, {});

        router.addDeactivateGuard("users", () => usersDeactivateGuard);

        expect(hasCanDeactivate("users")).toBe(true);

        // Navigate to same route with force option
        await router.navigate("users", {}, { force: true });

        // Guard should NOT be removed (same route is still active)
        expect(hasCanDeactivate("users")).toBe(true);
      });

      it("should handle autoCleanUp with redirect scenarios", async () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const profileDeactivateGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first
        await router.navigate("users", {}, {});

        // Set up guards and redirect after initial navigation
        router.addDeactivateGuard("users", () => usersDeactivateGuard);
        router.addDeactivateGuard("profile", () => profileDeactivateGuard);

        // Set up redirect from orders to profile using middleware
        router.useMiddleware(() => (toState) => {
          if (toState.name === "orders") {
            return { name: "profile", params: {}, path: "/profile" };
          }

          return; // Pass through for other routes
        });

        expect(hasCanDeactivate("users")).toBe(true);
        expect(hasCanDeactivate("profile")).toBe(true);

        // Navigate to orders (will redirect to profile)
        const state = await router.navigate("orders", {}, {});

        expect(state.name).toBe("profile");

        // users should be removed (was active, now not active in final state)
        expect(hasCanDeactivate("users")).toBe(false);

        // profile should remain (it's the final active route)
        expect(hasCanDeactivate("profile")).toBe(true);
      });

      it("should not cleanup guards that were never in active path", async () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const neverActiveGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first
        await router.navigate("users", {}, {});

        // Set up guards: one for active route, one for route we'll never visit
        router.addDeactivateGuard("users", () => usersDeactivateGuard);
        router.addDeactivateGuard("profile", () => neverActiveGuard);

        expect(hasCanDeactivate("users")).toBe(true);
        expect(hasCanDeactivate("profile")).toBe(true);

        // Navigate to orders (profile was never active, so shouldn't be cleaned)
        await router.navigate("orders", {}, {});

        // users should be removed (was active)
        expect(hasCanDeactivate("users")).toBe(false);

        // profile should NOT be removed (was never active)
        expect(hasCanDeactivate("profile")).toBe(true);
      });
    });
  });
});
