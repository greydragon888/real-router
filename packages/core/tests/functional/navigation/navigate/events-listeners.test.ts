import { describe, beforeEach, afterEach, it, expect } from "vitest";

import {
  events,
  errorCodes,
  getPluginApi,
  getLifecycleApi,
} from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State, RouterError } from "@real-router/core";

let router: Router;

describe("router.navigate() - events listeners", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("Issue #52: Recursive event listeners", () => {
    describe("TRANSITION_START event pollution", () => {
      it("should demonstrate current behavior: analytics fires for all redirects", async () => {
        const freshRouter = createTestRouter();
        const analyticsLog: string[] = [];

        await freshRouter.start("/home");

        // Side-effect listener (analytics) - should ideally fire once
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            analyticsLog.push(`analytics:${toState.name}`);
          },
        );

        // Guard listener that triggers redirect
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            if (toState.name === "admin") {
              // Redirect to login - triggers recursive TRANSITION_START
              void freshRouter.navigate("users");
            }
          },
        );

        // Navigate to admin (will be redirected to users)
        await freshRouter.navigate("admin");

        // Current behavior: analytics fires for BOTH admin AND users
        // This is the bug - analytics should only fire for final destination
        expect(analyticsLog).toStrictEqual([
          "analytics:admin",
          "analytics:users",
        ]);

        freshRouter.stop();
      });

      it("should demonstrate nested redirects cause exponential listener calls", async () => {
        const freshRouter = createTestRouter();
        const callLog: string[] = [];

        await freshRouter.start("/home");

        // Side-effect listener
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            callLog.push(`effect:${toState.name}`);
          },
        );

        // Chain of redirects: admin -> profile -> users
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            if (toState.name === "admin") {
              void freshRouter.navigate("profile");
            } else if (toState.name === "profile") {
              void freshRouter.navigate("users");
            }
          },
        );

        await freshRouter.navigate("admin");

        // Current: effect fires for admin, profile, AND users
        // Expected (ideal): effect fires only for users (final destination)
        expect(callLog).toStrictEqual([
          "effect:admin",
          "effect:profile",
          "effect:users",
        ]);

        freshRouter.stop();
      });
    });

    describe("TRANSITION_SUCCESS event pollution", () => {
      it("should fire success listener for each completed navigation when chained", async () => {
        const freshRouter = createTestRouter();
        const successLog: string[] = [];

        await freshRouter.start("/home");

        // Side-effect listener on success
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_SUCCESS,
          (toState: State) => {
            successLog.push(`success:${toState.name}`);
          },
        );

        // Navigate and then redirect in callback
        await freshRouter.navigate("admin");
        // After admin completes, navigate to users
        await freshRouter.navigate("users");

        // Each successful navigation fires TRANSITION_SUCCESS
        // Both admin and users navigations completed successfully
        expect(successLog).toStrictEqual(["success:admin", "success:users"]);

        freshRouter.stop();
      });
    });

    describe("TRANSITION_ERROR event pollution", () => {
      it("should demonstrate error listener fires during redirect error handling", async () => {
        const freshRouter = createTestRouter();
        const errorLog: string[] = [];

        await freshRouter.start("/home");

        // Error listener
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_ERROR,
          (
            _toState: State | undefined,
            _fromState: State | undefined,
            error: RouterError,
          ) => {
            errorLog.push(`error:${error.code}`);
          },
        );

        // Guard that blocks admin
        getLifecycleApi(freshRouter).addActivateGuard(
          "admin",
          () => () => false,
        );

        try {
          await freshRouter.navigate("admin");
        } catch (error: any) {
          // Expected: navigation fails due to guard
          expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
        }

        // Error listener fires once for the blocked navigation
        expect(errorLog).toStrictEqual(["error:CANNOT_ACTIVATE"]);

        freshRouter.stop();
      });
    });

    describe("Multiple listeners interaction", () => {
      it("should execute all listeners at each recursion level", async () => {
        const freshRouter = createTestRouter();
        const listener1Calls: string[] = [];
        const listener2Calls: string[] = [];
        const listener3Calls: string[] = [];

        await freshRouter.start("/home");

        // Listener 1: analytics
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            listener1Calls.push(toState.name);
          },
        );

        // Listener 2: UI update
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            listener2Calls.push(toState.name);
          },
        );

        // Listener 3: redirect guard
        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            listener3Calls.push(toState.name);

            if (toState.name === "admin") {
              void freshRouter.navigate("users");
            }
          },
        );

        await freshRouter.navigate("admin");

        // All 3 listeners fire for both admin and users
        expect(listener1Calls).toStrictEqual(["admin", "users"]);
        expect(listener2Calls).toStrictEqual(["admin", "users"]);
        expect(listener3Calls).toStrictEqual(["admin", "users"]);

        freshRouter.stop();
      });
    });

    describe("Order of execution", () => {
      it("should maintain listener registration order at each level", async () => {
        const freshRouter = createTestRouter();
        const executionOrder: string[] = [];

        await freshRouter.start("/home");

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            executionOrder.push(`first:${toState.name}`);
          },
        );

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            executionOrder.push(`second:${toState.name}`);

            if (toState.name === "admin") {
              void freshRouter.navigate("users");
            }
          },
        );

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            executionOrder.push(`third:${toState.name}`);
          },
        );

        await freshRouter.navigate("admin");

        // Order shows: all listeners for admin, then all for users
        expect(executionOrder).toStrictEqual([
          "first:admin",
          "second:admin",
          // Recursion happens here (navigate to users)
          "first:users",
          "second:users",
          "third:users",
          // Then third listener for admin completes
          "third:admin",
        ]);

        freshRouter.stop();
      });
    });

    describe("Recursion depth tracking", () => {
      it("should track all states in redirect chain", async () => {
        const freshRouter = createTestRouter();
        const redirects: string[] = [];

        await freshRouter.start("/home");

        getPluginApi(freshRouter).addEventListener(
          events.TRANSITION_START,
          (toState: State) => {
            redirects.push(toState.name);

            // Redirect chain: users -> orders -> profile
            if (toState.name === "users") {
              void freshRouter.navigate("orders");
            } else if (toState.name === "orders") {
              void freshRouter.navigate("profile");
            }
          },
        );

        await freshRouter.navigate("users");

        // All redirects in the chain are tracked
        // Current behavior: each redirect triggers all listeners
        expect(redirects).toStrictEqual(["users", "orders", "profile"]);

        freshRouter.stop();
      });
    });
  });
});
