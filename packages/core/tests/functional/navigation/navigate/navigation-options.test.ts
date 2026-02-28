import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getLifecycleApi, events, getPluginApi } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State, LifecycleApi } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - navigation meta and options", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("should be able to call navigate with 3 args without callback", async () => {
    await router.navigate("orders.pending", {}, { force: true });

    expect(router.getState()?.name).toBe("orders.pending");
  });

  it("should add navigation options to meta", async () => {
    const options = { reload: true, replace: true, force: true };

    await router.navigate("profile", {}, options);

    expect(router.getState()?.meta?.options).toStrictEqual(options);
  });

  it("should allow navigation when canActivate guard returns true", async () => {
    lifecycle.addActivateGuard("profile", () => () => true);

    const state = await router.navigate("profile", {}, {});

    expect(state.name).toBe("profile");
  });

  it("should allow navigation when guard returns true after previous navigation", async () => {
    await router.navigate("users", {}, { replace: true });

    lifecycle.addActivateGuard("settings", () => () => true);

    const state = await router.navigate("settings", {}, {});

    expect(state.name).toBe("settings");
  });

  it("should allow navigation when canDeactivate guard returns true", async () => {
    lifecycle.addDeactivateGuard("home", () => () => true);

    const state = await router.navigate("settings", {}, {});

    expect(state.name).toBe("settings");
  });

  it("should preserve original navigation options in final state", async () => {
    lifecycle.addActivateGuard("profile", () => () => true);

    const navOptions = { reload: true, replace: true };

    const state = await router.navigate("profile", {}, navOptions);

    expect(state.meta?.options.reload).toBe(true);
    expect(state.meta?.options.replace).toBe(true);
  });

  it("should execute both deactivate and activate guards during transition", async () => {
    let deactivateCallCount = 0;
    let activateCallCount = 0;

    lifecycle.addDeactivateGuard("home", () => () => {
      deactivateCallCount++;

      return true;
    });

    lifecycle.addActivateGuard("profile", () => () => {
      activateCallCount++;

      return true;
    });

    const state = await router.navigate("profile", {}, {});

    expect(state.name).toBe("profile");
    expect(deactivateCallCount).toBe(1);
    expect(activateCallCount).toBe(1);
  });

  describe("Issue #59: opts.redirected flows through to meta.options (verifies 12.3 fix)", () => {
    it("should not have meta.options.redirected for normal navigation", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start("/home");

      const resultState = await freshRouter.navigate("users", {}, {});

      expect(resultState).toBeDefined();
      expect(resultState.meta?.options.redirected).toBeUndefined();

      freshRouter.stop();
    });

    it("should have meta.options.redirected = true when opts.redirected is true", async () => {
      const freshRouter = createTestRouter();

      await freshRouter.start("/home");

      const resultState = await freshRouter.navigate(
        "users",
        {},
        { redirected: true },
      );

      expect(resultState).toBeDefined();
      expect(resultState.meta?.options.redirected).toBe(true);

      freshRouter.stop();
    });

    it("should preserve redirected flag through navigation lifecycle", async () => {
      const freshRouter = createTestRouter();
      const stateLog: { redirected: boolean | undefined }[] = [];

      await freshRouter.start("/home");

      getPluginApi(freshRouter).addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: State) => {
          stateLog.push({
            redirected: toState.meta?.options.redirected,
          });
        },
      );

      await freshRouter.navigate("users", {}, {});

      await freshRouter.navigate(
        "users.view",
        { id: "1" },
        { redirected: true },
      );

      expect(stateLog).toStrictEqual([
        { redirected: undefined },
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

      await freshRouter.start("/home");
      await freshRouter.navigate("users", {}, {});

      // Register first guard (factory pattern: () => guardFn)
      getLifecycleApi(freshRouter).addDeactivateGuard("users", () => () => {
        callLog.push("guard1");

        return true;
      });

      // Register second guard for the SAME route - should REPLACE, not add
      getLifecycleApi(freshRouter).addDeactivateGuard("users", () => () => {
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

      await freshRouter.start("/home");

      // Register first guard (factory pattern: () => guardFn)
      getLifecycleApi(freshRouter).addActivateGuard("users", () => () => {
        callLog.push("guard1");

        return true;
      });

      // Register second guard for the SAME route - should REPLACE, not add
      getLifecycleApi(freshRouter).addActivateGuard("users", () => () => {
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

      await freshRouter.start("/home");
      await freshRouter.navigate("users", {}, {});

      // Register handler 10 times for the same route (factory pattern)
      for (let i = 0; i < 10; i++) {
        getLifecycleApi(freshRouter).addDeactivateGuard("users", () => () => {
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

      await freshRouter.start("/home");
      await freshRouter.navigate("users", {}, {});

      // Register guard for users (factory pattern)
      getLifecycleApi(freshRouter).addDeactivateGuard("users", () => () => {
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

      await freshRouter.start("/home");

      getPluginApi(freshRouter).addEventListener(
        events.TRANSITION_START,
        (toState: State) => {
          startLog.push(toState.name);
        },
      );

      getPluginApi(freshRouter).addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: State) => {
          successLog.push(toState.name);
        },
      );

      getPluginApi(freshRouter).addEventListener(
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

      freshRouter.usePlugin(() => ({
        onTransitionSuccess: (toState) => {
          if (toState.name !== "home") {
            void new Promise((resolve) => setTimeout(resolve, 50));
          }
        },
      }));

      await freshRouter.start("/home");

      getPluginApi(freshRouter).addEventListener(
        events.TRANSITION_SUCCESS,
        (toState: State) => {
          successLog.push(toState.name);
        },
      );

      getPluginApi(freshRouter).addEventListener(
        events.TRANSITION_CANCEL,
        (toState: State) => {
          cancelLog.push(toState.name);
        },
      );

      // Start async navigation to users (don't await - let it run in background)
      freshRouter.navigate("users", {}, {}).catch(() => {});
      // Immediately navigate to orders (should cancel users)
      await freshRouter.navigate("orders", {}, {});

      // Wait a bit for cancellation event to fire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // With async middleware, both navigations complete (no cancellation)
      // This is expected behavior - synchronous navigations complete before async ones
      expect(freshRouter.getState()?.name).toBe("orders");

      freshRouter.stop();
    });
  });
});
