import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core";

let router: Router;

describe("router.navigate() - navigation meta and options", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should be able to call navigate with 3 args without done cb", async () => {
    await router.navigate("orders.pending", {}, { force: true });

    expect(router.getState()?.name).toBe("orders.pending");
  });

  it("should add navigation options to meta", async () => {
    const options = { reload: true, replace: true, source: "external" };

    await router.navigate("profile", {}, options);

    expect(router.getState()?.meta?.options).toStrictEqual(options);
  });

  it("should merge states when canActivate guard returns modified state", async () => {
    // Set up guard that returns new state
    router.addActivateGuard("profile", () => (toState, _fromState) => {
      const modifiedState = {
        ...toState,
        meta: {
          id: 42,
          options: { guardFlag: true },
          redirected: true,
          params: { userId: "guard123", source: "canActivate" },
        },
      };

      return modifiedState;
    });

    // Navigate to profile
    const state = await router.navigate("profile", {}, {});

    // mergeStates logic:
    // 1. Default meta values (id: 1, options: {}, redirected: false, params: {})
    // 2. fromState.meta (original navigation state)
    // 3. toState.meta (guard's modified state) - overwrites
    // 4. Special params merge: toState.params + fromState.params

    expect(state.meta?.id).toBe(42); // Guard's id overwrites default
    expect(state.meta?.options.guardFlag).toBe(true); // Guard's options
    expect(state.meta?.redirected).toBe(true); // Guard's redirected
    expect(state.meta?.params.userId).toBe("guard123"); // From guard
    expect(state.meta?.params.source).toBe("canActivate"); // From guard
  });

  it("should merge params from both states when guard modifies state", async () => {
    // First navigate to establish fromState with meta params
    await router.navigate("home", {}, { custom: "option" });

    // Now set up guard for next navigation
    router.addActivateGuard("settings", () => (toState, _fromState) => {
      const modifiedState = {
        ...toState,
        meta: {
          ...toState.meta!,
          params: {
            guardAdded: "yes",
            timestamp: 12_345,
          },
        },
      };

      return modifiedState;
    });

    // Navigate to settings - this will trigger mergeStates
    const state = await router.navigate("settings", {}, {});

    // Check params merge: toState.params + fromState.params
    expect(state.meta?.params.guardAdded).toBe("yes"); // From guard (toState)
    expect(state.meta?.params.timestamp).toBe(12_345); // From guard (toState)

    // fromState params should also be present if any existed
    // Note: fromState.meta.params might be empty depending on navigation
  });

  it("should handle state merge when canDeactivate modifies state", async () => {
    // Set up canDeactivate guard that modifies the transition state
    router.addDeactivateGuard("home", () => (toState, _fromState) => {
      const modifiedState = {
        ...toState, // This is the target state (settings)
        meta: {
          ...toState.meta!,
          params: {
            ...toState.meta?.params,
            exitedFrom: "home",
            exitTime: Date.now(),
          },
          options: {
            ...toState.meta?.options,
            deactivated: true,
          },
        },
      };

      return modifiedState;
    });

    const state = await router.navigate("settings", {}, {});

    // Check that canDeactivate modifications are present
    expect(state.meta?.params.exitedFrom).toBe("home");
    expect(state.meta?.params.exitTime).toBeDefined();
    expect(state.meta?.options.deactivated).toBe(true);
  });

  it("should preserve original navigation options in final state", async () => {
    // Set up guard that adds some meta but preserves options
    router.addActivateGuard("profile", () => (toState, _fromState) => {
      const modifiedState = {
        ...toState,
        meta: {
          ...toState.meta!,
          params: {
            ...toState.meta?.params,
            guardParam: "added",
          },
        },
      };

      return modifiedState;
    });

    // Navigate with specific options
    const navOptions = { reload: true, replace: true };

    const state = await router.navigate("profile", {}, navOptions);

    // Original navigation options should be preserved
    expect(state.meta?.options.reload).toBe(true);
    expect(state.meta?.options.replace).toBe(true);

    // Guard's param should also be present
    expect(state.meta?.params.guardParam).toBe("added");
  });

  it("should handle multiple guard modifications in transition chain", async () => {
    let deactivateCallCount = 0;
    let activateCallCount = 0;

    // canDeactivate modifies state when leaving home
    router.addDeactivateGuard("home", () => (toState, _fromState) => {
      deactivateCallCount++;
      const modifiedState = {
        ...toState,
        meta: {
          ...toState.meta!,
          params: {
            ...toState.meta?.params,
            leftAt: Date.now(),
            deactivateOrder: deactivateCallCount,
          },
        },
      };

      return modifiedState;
    });

    // canActivate modifies state when entering profile
    router.addActivateGuard("profile", () => (toState, _fromState) => {
      activateCallCount++;
      const modifiedState = {
        ...toState,
        meta: {
          ...toState.meta!,
          params: {
            ...toState.meta?.params,
            activatedAt: Date.now(),
            activateOrder: activateCallCount,
          },
        },
      };

      return modifiedState;
    });

    const state = await router.navigate("profile", {}, {});

    // Both guards should have been called
    expect(deactivateCallCount).toBe(1);
    expect(activateCallCount).toBe(1);

    // Final state should contain modifications from both guards
    expect(state.meta?.params.leftAt).toBeDefined();
    expect(state.meta?.params.deactivateOrder).toBe(1);
    expect(state.meta?.params.activatedAt).toBeDefined();
    expect(state.meta?.params.activateOrder).toBe(1);
  });

  describe("Issue #54: state.meta.redirected behavior", () => {
    // Issue #54 was about meta.redirected not reflecting redirect status.
    // After guards redirect removal: meta.redirected is always false
    // because guards cannot redirect anymore.

    describe("meta.redirected should be false for normal navigation", () => {
      it("should have meta.redirected = false for direct navigation", async () => {
        const state = await router.navigate("users");

        expect(state?.meta?.redirected).toBe(false);
      });

      it("should have meta.redirected = false for navigation with params", async () => {
        const state = await router.navigate("users.view", { id: "123" });

        expect(state?.meta?.redirected).toBe(false);
      });

      it("should have meta.redirected = false for navigation with options", async () => {
        const state = await router.navigate("users", {}, { replace: true });

        expect(state?.meta?.redirected).toBe(false);
      });
    });

    // Note: Guards cannot redirect anymore, so no "meta.redirected = true" tests
    // Middleware redirect tests have been removed as well since guards can't redirect
  });

  describe("Issue #59: meta.redirected reflects opts.redirected (verifies 12.3 fix)", () => {
    /**
     * Issue #59 / 12.3: Verify that state.meta.redirected properly reflects
     * the opts.redirected value passed during navigation.
     *
     * Previously, redirected was always set to false, ignoring opts.redirected.
     * The fix changed `redirected: false` to `redirected: opts.redirected ?? false`.
     */

    it("should have meta.redirected = false for normal navigation", async () => {
      const freshRouter = createTestRouter();

      freshRouter.start();

      const resultState = await freshRouter.navigate("users", {}, {});

      expect(resultState).toBeDefined();
      expect(resultState?.meta?.redirected).toBe(false);

      freshRouter.stop();
    });

    it("should have meta.redirected = true when opts.redirected is true", async () => {
      const freshRouter = createTestRouter();

      freshRouter.start();

      // Simulate what would happen during a redirect
      const resultState = await freshRouter.navigate(
        "users",
        {},
        { redirected: true },
      );

      expect(resultState).toBeDefined();
      expect(resultState?.meta?.redirected).toBe(true);

      freshRouter.stop();
    });

    it("should preserve redirected flag through navigation lifecycle", async () => {
      const freshRouter = createTestRouter();
      const stateLog: { redirected: boolean | undefined }[] = [];

      freshRouter.start();

      freshRouter.addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: State) => {
          stateLog.push({
            redirected: toState.meta?.redirected,
          });
        },
      );

      // Normal navigation
      await freshRouter.navigate("users", {}, {});

      // Navigation with redirected flag
      await freshRouter.navigate(
        "users.view",
        { id: "1" },
        { redirected: true },
      );

      expect(stateLog).toStrictEqual([
        { redirected: false },
        { redirected: true },
      ]);

      freshRouter.stop();
    });
  });

  // Analysis risk 9.12: "Memory leak with forgotten guards"
  // RESULT: FALSE POSITIVE - handlers are REPLACED, not accumulated
  describe("canDeactivate handler replacement (analysis 9.12 - confirmed NOT a bug)", () => {
    it("should replace canDeactivate handler, not accumulate", async () => {
      const freshRouter = createTestRouter();
      const callLog: string[] = [];

      freshRouter.start();
      await freshRouter.navigate("users", {}, {});

      // Register first guard (factory pattern: () => guardFn)
      freshRouter.addDeactivateGuard("users", () => () => {
        callLog.push("guard1");

        return true;
      });

      // Register second guard for the SAME route - should REPLACE, not add
      freshRouter.addDeactivateGuard("users", () => () => {
        callLog.push("guard2");

        return true;
      });

      // Navigate away
      await freshRouter.navigate("home", {}, {});

      // Only guard2 should be called (guard1 was replaced)
      expect(callLog).toStrictEqual(["guard2"]);

      freshRouter.stop();
    });

    it("should replace canActivate handler, not accumulate", async () => {
      const freshRouter = createTestRouter();
      const callLog: string[] = [];

      freshRouter.start();

      // Register first guard (factory pattern: () => guardFn)
      freshRouter.addActivateGuard("users", () => () => {
        callLog.push("guard1");

        return true;
      });

      // Register second guard for the SAME route - should REPLACE, not add
      freshRouter.addActivateGuard("users", () => () => {
        callLog.push("guard2");

        return true;
      });

      // Navigate to users
      await freshRouter.navigate("users", {}, {});

      // Only guard2 should be called (guard1 was replaced)
      expect(callLog).toStrictEqual(["guard2"]);

      freshRouter.stop();
    });

    it("should not accumulate handlers after multiple registrations", async () => {
      const freshRouter = createTestRouter();
      let callCount = 0;

      freshRouter.start();
      await freshRouter.navigate("users", {}, {});

      // Register handler 10 times for the same route (factory pattern)
      for (let i = 0; i < 10; i++) {
        freshRouter.addDeactivateGuard("users", () => () => {
          callCount++;

          return true;
        });
      }

      // Navigate away
      await freshRouter.navigate("home", {}, {});

      // Should only call once (last handler), not 10 times
      expect(callCount).toBe(1);

      freshRouter.stop();
    });

    it("should automatically clear canDeactivate when navigating to different branch", async () => {
      const freshRouter = createTestRouter();
      const callLog: string[] = [];

      freshRouter.start();
      await freshRouter.navigate("users", {}, {});

      // Register guard for users (factory pattern)
      freshRouter.addDeactivateGuard("users", () => () => {
        callLog.push("users-guard");

        return true;
      });

      // Navigate to users.view (same branch)
      await freshRouter.navigate("users.view", { id: "1" }, {});

      // Navigate away to different branch
      await freshRouter.navigate("home", {}, {});

      // Guard was called when leaving users branch
      expect(callLog).toStrictEqual(["users-guard"]);

      // Navigate back to users
      callLog.length = 0;
      await freshRouter.navigate("users", {}, {});

      // Navigate away again - guard should NOT be called (was auto-cleared)
      await freshRouter.navigate("home", {}, {});

      // Guard was auto-cleared, so not called
      expect(callLog).toStrictEqual([]);

      freshRouter.stop();
    });
  });

  // Analysis risk 9.11: "Race condition with rapid sequential navigations"
  // RESULT: FALSE POSITIVE - synchronous navigations complete immediately,
  // only the last state is visible to UI
  describe("rapid sequential navigations (analysis 9.11 - confirmed NOT a bug)", () => {
    it("should complete all navigations synchronously without cancellation", async () => {
      const freshRouter = createTestRouter();
      const successLog: string[] = [];
      const startLog: string[] = [];
      const cancelLog: string[] = [];

      freshRouter.start();

      freshRouter.addEventListener(
        events.TRANSITION_START,
        (toState: State) => {
          startLog.push(toState.name);
        },
      );

      freshRouter.addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: State) => {
          successLog.push(toState.name);
        },
      );

      freshRouter.addEventListener(
        events.TRANSITION_CANCEL,
        (toState: State) => {
          cancelLog.push(toState.name);
        },
      );

      // Rapid sequential navigations (synchronous - no guards/middleware)
      await freshRouter.navigate("users", {}, {});
      await freshRouter.navigate("orders", {}, {});
      await freshRouter.navigate("home", {}, {});

      // All 3 navigations complete synchronously (no async guards/middleware)
      // Each navigation completes BEFORE the next one starts
      expect(startLog).toStrictEqual(["users", "orders", "home"]);
      expect(successLog).toStrictEqual(["users", "orders", "home"]);
      expect(cancelLog).toStrictEqual([]); // No cancellations!

      // Final state is "home" as expected
      expect(freshRouter.getState()?.name).toBe("home");

      freshRouter.stop();
    });

    it("should only emit final state when async guards delay transitions", async () => {
      const freshRouter = createTestRouter();
      const successLog: string[] = [];
      const cancelLog: string[] = [];

      // Add async guard that delays activation
      freshRouter.addActivateGuard("users", () => () => {
        return new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 10),
        );
      });

      freshRouter.start();

      freshRouter.addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: State) => {
          successLog.push(toState.name);
        },
      );

      freshRouter.addEventListener(
        events.TRANSITION_CANCEL,
        (toState: State) => {
          cancelLog.push(toState.name);
        },
      );

      // Start async navigation to users
      freshRouter.navigate("users", {}, {});
      // Immediately navigate to orders (should cancel users)
      await freshRouter.navigate("orders", {}, {});

      // Wait for all transitions to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // users was cancelled, orders completed
      expect(cancelLog).toStrictEqual(["users"]);
      expect(successLog).toStrictEqual(["orders"]);
      expect(freshRouter.getState()?.name).toBe("orders");

      freshRouter.stop();
    });
  });
});
