import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - auto cleanup", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation with options.autoCleanUp === true", () => {
    let routerWithAutoCleanUp: Router;

    beforeEach(() => {
      vi.spyOn(logger, "error").mockImplementation(noop);

      // Create router with autoCleanUp enabled
      routerWithAutoCleanUp = createRouter(
        [
          { name: "home", path: "/" },
          { name: "users", path: "/users" },
          { name: "users.list", path: "/list" },
          { name: "users.view", path: "/view/:id" },
          { name: "orders", path: "/orders" },
          { name: "orders.pending", path: "/pending" },
          { name: "orders.completed", path: "/completed" },
          { name: "profile", path: "/profile" },
          { name: "settings", path: "/settings" },
          { name: "settings.general", path: "/general" },
          { name: "settings.account", path: "/account" },
        ],
        {
          defaultRoute: "home",
        },
      );

      routerWithAutoCleanUp.start();
    });

    afterEach(() => {
      routerWithAutoCleanUp.stop();
    });

    describe("basic autoCleanUp functionality", () => {
      it("should call clearCanDeactivate for previously active segments that become inactive", () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const ordersDeactivateGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first to establish a baseline
        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Now set up guards only for routes we'll actually use
          routerWithAutoCleanUp.canDeactivate(
            "users",
            () => usersDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "orders",
            () => ordersDeactivateGuard,
          );

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Navigate to orders - users becomes inactive and should be cleaned up
          routerWithAutoCleanUp.navigate("orders", {}, {}, (err) => {
            expect(err).toBeUndefined();

            // Should clean up users (was previously active, now inactive)
            expect(clearCanDeactivateSpy).toHaveBeenCalledWith("users");
            // orders should not be cleared (it's now active)
            expect(clearCanDeactivateSpy).not.toHaveBeenCalledWith("orders");

            clearCanDeactivateSpy.mockClear();

            // Navigate back to users - orders becomes inactive and should be cleaned up
            routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
              expect(err).toBeUndefined();

              // Should clean up orders (now inactive)
              expect(clearCanDeactivateSpy).toHaveBeenCalledTimes(1);
              expect(clearCanDeactivateSpy).toHaveBeenCalledWith("orders");
              expect(clearCanDeactivateSpy).not.toHaveBeenCalledWith("users");
            });
          });
        });
      });

      it("should only clean up segments that are not in active path for nested routes", () => {
        // Navigate to users first to establish baseline
        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Set up guards after navigation
          const usersDeactivateGuard = vi.fn().mockReturnValue(true);
          const usersListDeactivateGuard = vi.fn().mockReturnValue(true);
          const usersViewDeactivateGuard = vi.fn().mockReturnValue(true);

          routerWithAutoCleanUp.canDeactivate(
            "users",
            () => usersDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "users.list",
            () => usersListDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "users.view",
            () => usersViewDeactivateGuard,
          );

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Navigate to users.list
          routerWithAutoCleanUp.navigate("users.list", {}, {}, (err) => {
            expect(err).toBeUndefined();

            clearCanDeactivateSpy.mockClear();

            // Navigate to users.view (users remains active, but users.list becomes inactive)
            routerWithAutoCleanUp.navigate(
              "users.view",
              { id: 123 },
              {},
              (err) => {
                expect(err).toBeUndefined();

                // Should only clean up users.list (users is still active in the path)
                expect(clearCanDeactivateSpy).toHaveBeenCalledTimes(1);
                expect(clearCanDeactivateSpy).toHaveBeenCalledWith(
                  "users.list",
                );

                // users and users.view should not be cleared (they're active)
                expect(clearCanDeactivateSpy).not.toHaveBeenCalledWith("users");
                expect(clearCanDeactivateSpy).not.toHaveBeenCalledWith(
                  "users.view",
                );
              },
            );
          });
        });
      });

      it("should handle complex nested route transitions correctly", () => {
        // Navigate to home first
        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Set up guards after navigation
          const settingsDeactivateGuard = vi.fn().mockReturnValue(true);
          const settingsGeneralDeactivateGuard = vi.fn().mockReturnValue(true);
          const settingsAccountDeactivateGuard = vi.fn().mockReturnValue(true);

          routerWithAutoCleanUp.canDeactivate(
            "settings",
            () => settingsDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "settings.general",
            () => settingsGeneralDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "settings.account",
            () => settingsAccountDeactivateGuard,
          );

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Navigate through nested routes: settings.general -> settings.account -> users
          routerWithAutoCleanUp.navigate("settings.general", {}, {}, (err) => {
            expect(err).toBeUndefined();

            clearCanDeactivateSpy.mockClear();

            // Navigate within settings hierarchy
            routerWithAutoCleanUp.navigate(
              "settings.account",
              {},
              {},
              (err) => {
                expect(err).toBeUndefined();

                // Should only clean up settings.general (settings remains active)
                expect(clearCanDeactivateSpy).toHaveBeenCalledTimes(1);
                expect(clearCanDeactivateSpy).toHaveBeenCalledWith(
                  "settings.general",
                );

                clearCanDeactivateSpy.mockClear();

                // Navigate out of settings hierarchy completely
                routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
                  expect(err).toBeUndefined();

                  // Should clean up remaining settings segments
                  expect(clearCanDeactivateSpy).toHaveBeenCalledTimes(2);
                  expect(clearCanDeactivateSpy).toHaveBeenCalledWith(
                    "settings",
                  );
                  expect(clearCanDeactivateSpy).toHaveBeenCalledWith(
                    "settings.account",
                  );
                });
              },
            );
          });
        });
      });
    });

    describe("autoCleanUp with transition errors", () => {
      it("should not call clearCanDeactivate when middleware blocks transition", () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const blockingMiddleware = vi.fn().mockReturnValue(false);

        routerWithAutoCleanUp.canDeactivate(
          "users",
          () => usersDeactivateGuard,
        );
        routerWithAutoCleanUp.useMiddleware(() => blockingMiddleware);

        const clearCanDeactivateSpy = vi.spyOn(
          routerWithAutoCleanUp,
          "clearCanDeactivate",
        );

        // This should work but currently fails
        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined(); // FAILS: middleware blocks initial navigation

          clearCanDeactivateSpy.mockClear();

          routerWithAutoCleanUp.navigate("orders", {}, {}, (err) => {
            expect(err?.code).toBe(errorCodes.TRANSITION_ERR);
            expect(clearCanDeactivateSpy).not.toHaveBeenCalled();
          });
        });
      });

      it("should not call clearCanDeactivate when canActivate blocks transition", () => {
        // Current problem: guard blocks initial navigation, preventing test setup
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const blockingActivateGuard = vi.fn().mockReturnValue(false);

        routerWithAutoCleanUp.canDeactivate(
          "users",
          () => usersDeactivateGuard,
        );
        routerWithAutoCleanUp.canActivate(
          "profile",
          () => blockingActivateGuard,
        );

        const clearCanDeactivateSpy = vi.spyOn(
          routerWithAutoCleanUp,
          "clearCanDeactivate",
        );

        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          clearCanDeactivateSpy.mockClear();

          routerWithAutoCleanUp.navigate("profile", {}, {}, (err) => {
            expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);
            expect(clearCanDeactivateSpy).not.toHaveBeenCalled();
          });
        });
      });

      it("should not call clearCanDeactivate when canDeactivate blocks transition", () => {
        const normalDeactivateGuard = vi.fn().mockReturnValue(true);
        const blockingDeactivateGuard = vi.fn().mockReturnValue(false);

        // Navigate to users first with normal guard
        routerWithAutoCleanUp.canDeactivate(
          "users",
          () => normalDeactivateGuard,
        );

        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Replace with blocking guard
          routerWithAutoCleanUp.canDeactivate(
            "users",
            () => blockingDeactivateGuard,
          );

          // Try to navigate away (should be blocked)
          routerWithAutoCleanUp.navigate("orders", {}, {}, (err) => {
            expect(err?.code).toBe(errorCodes.CANNOT_DEACTIVATE);

            // clearCanDeactivate should not be called due to failed transition
            expect(clearCanDeactivateSpy).not.toHaveBeenCalled();
          });
        });
      });
    });

    describe("autoCleanUp edge cases", () => {
      it("should handle empty canDeactivateFunctions object gracefully", () => {
        // No canDeactivate guards set
        const clearCanDeactivateSpy = vi.spyOn(
          routerWithAutoCleanUp,
          "clearCanDeactivate",
        );

        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          clearCanDeactivateSpy.mockClear();

          routerWithAutoCleanUp.navigate("orders", {}, {}, (err) => {
            expect(err).toBeUndefined();

            // clearCanDeactivate should not be called when no guards are set
            expect(clearCanDeactivateSpy).not.toHaveBeenCalled();
          });
        });
      });

      it("should handle navigation to same route with autoCleanUp", () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);

        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          routerWithAutoCleanUp.canDeactivate(
            "users",
            () => usersDeactivateGuard,
          );

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Navigate to same route with force option
          routerWithAutoCleanUp.navigate(
            "users",
            {},
            { force: true },
            (err) => {
              expect(err).toBeUndefined();

              // No segments should be cleaned up (same route is still active)
              expect(clearCanDeactivateSpy).not.toHaveBeenCalled();
            },
          );
        });
      });

      it("should handle autoCleanUp with redirect scenarios", () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const profileDeactivateGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first
        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Set up guards and redirect after initial navigation
          routerWithAutoCleanUp.canDeactivate(
            "users",
            () => usersDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "profile",
            () => profileDeactivateGuard,
          );

          // Set up redirect from orders to profile
          routerWithAutoCleanUp.canActivate("orders", () => () => {
            return { name: "profile", params: {}, path: "/profile" };
          });

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Navigate to orders (will redirect to profile)
          routerWithAutoCleanUp.navigate("orders", {}, {}, (err, state) => {
            expect(err).toBeUndefined();
            expect(state?.name).toBe("profile");

            // Should clean up users (was active, now not active in final state)
            expect(clearCanDeactivateSpy).toHaveBeenCalledWith("users");
            // Should not clean up profile (it's the final active route)
            expect(clearCanDeactivateSpy).not.toHaveBeenCalledWith("profile");
          });
        });
      });

      it("should not cleanup guards that were never in active path", () => {
        const usersDeactivateGuard = vi.fn().mockReturnValue(true);
        const neverActiveGuard = vi.fn().mockReturnValue(true);

        // Navigate to users first
        routerWithAutoCleanUp.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          // Set up guards: one for active route, one for route we'll never visit
          routerWithAutoCleanUp.canDeactivate(
            "users",
            () => usersDeactivateGuard,
          );
          routerWithAutoCleanUp.canDeactivate(
            "profile",
            () => neverActiveGuard,
          );

          const clearCanDeactivateSpy = vi.spyOn(
            routerWithAutoCleanUp,
            "clearCanDeactivate",
          );

          // Navigate to orders (profile was never active, so shouldn't be cleaned)
          routerWithAutoCleanUp.navigate("orders", {}, {}, (err) => {
            expect(err).toBeUndefined();

            // Should only clean up users (was active)
            expect(clearCanDeactivateSpy).toHaveBeenCalledTimes(1);
            expect(clearCanDeactivateSpy).toHaveBeenCalledWith("users");

            // Should NOT clean up profile (was never active)
            expect(clearCanDeactivateSpy).not.toHaveBeenCalledWith("profile");
          });
        });
      });
    });
  });
});
