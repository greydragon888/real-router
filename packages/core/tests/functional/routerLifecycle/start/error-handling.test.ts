import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import {
  errorCodes,
  events,
  getLifecycleApi,
  getPluginApi,
} from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { LifecycleApi, Router } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.start() - error handling", () => {
  beforeEach(() => {
    router = createTestRouter();
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
  });

  // "scenarios without a starting state" tests removed in Task 6 — start() now requires path

  // Note: "protectedDone callback guard" tests were removed because they
  // required replacing navigateToState directly, which no longer works
  // with dependency injection. The protectedDone guard is tested implicitly
  // through the navigation namespace unit tests.;

  describe("error handling edge cases", () => {
    describe("event listener exceptions", () => {
      // NOTE: Event listener exceptions are CAUGHT by EventEmitter.emit()
      // and logged via logger.error(). They do NOT propagate to caller.
      // This is correct behavior - protects router from user code errors.

      it("should catch and log exception from ROUTER_START event listener", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Add listener that throws
        getPluginApi(router).addEventListener(events.ROUTER_START, () => {
          throw new Error("Listener crashed");
        });

        // Exception should NOT propagate (caught internally)
        await router.start("/home");

        // Router should be started successfully
        expect(router.isActive()).toBe(true);
        expect(router.getState()).toBeDefined();

        // Error should be logged (format: logger.error("Router", "Error in listener for <event>:", Error))
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      it("should catch and log exception from TRANSITION_SUCCESS event listener", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Add listener that throws on TRANSITION_SUCCESS
        getPluginApi(router).addEventListener(events.TRANSITION_SUCCESS, () => {
          throw new Error("Success listener crashed");
        });

        // Exception should NOT propagate
        await router.start("/home");

        // Router should be started successfully
        expect(router.isActive()).toBe(true);

        // Error should be logged
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      it("should catch and log exception from TRANSITION_ERROR event listener", async () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        router = createTestRouter({ allowNotFound: false });

        // Add listener that throws on TRANSITION_ERROR
        getPluginApi(router).addEventListener(events.TRANSITION_ERROR, () => {
          throw new Error("Error listener crashed");
        });

        // Exception should NOT propagate when route not found
        try {
          await router.start("/nonexistent/path");
        } catch {
          // Expected to throw
        }

        // Router should NOT be started (route not found)
        expect(router.isActive()).toBe(false);

        // Error should be logged
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });
    });

    describe("invalid callback type", () => {
      // NOTE: Invalid callbacks are caught by safeCallback() in navigation.ts
      // TypeError is logged but NOT propagated. Router continues to work.
      // This documents ACTUAL behavior (defensive coding).

      it("should catch TypeError when string callback is invoked", async () => {
        // TypeScript prevents this at compile time, but runtime catches it
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", "not a function");

        // Router should be started (callback error doesn't break router)
        expect(router.isActive()).toBe(true);
      });

      it("should catch TypeError when object callback is invoked", async () => {
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", { callback: true });

        expect(router.isActive()).toBe(true);
      });

      it("should catch TypeError when number callback is invoked", async () => {
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", 123);

        expect(router.isActive()).toBe(true);
      });

      it("should work correctly when second argument is undefined", async () => {
        // undefined should be replaced with noop
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", undefined);

        expect(router.isActive()).toBe(true);
      });

      it("should work correctly when second argument is null", async () => {
        // null is falsy, so noop is used
        // @ts-expect-error - testing invalid callback type
        await router.start("/home", null);

        expect(router.isActive()).toBe(true);
      });
    });

    describe("concurrent start() calls", () => {
      it("should handle rapid sequential start() calls", async () => {
        // First call should succeed
        await router.start("/home");

        // Subsequent calls should fail with ROUTER_ALREADY_STARTED
        try {
          await router.start("/users");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
        }

        try {
          await router.start("/orders");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
        }

        // Router should be in state from first call
        expect(router.getState()?.name).toBe("home");
      });

      it("should maintain consistent state during concurrent start attempts", async () => {
        const startListeners: number[] = [];

        getPluginApi(router).addEventListener(events.ROUTER_START, () => {
          startListeners.push(Date.now());
        });

        // First start succeeds
        await router.start("/home");

        // Attempt multiple starts (should fail)
        try {
          await router.start("/users");
        } catch {
          // Expected
        }

        try {
          await router.start("/orders");
        } catch {
          // Expected
        }

        // ROUTER_START should only be emitted once
        expect(startListeners).toHaveLength(1);

        // Router should be started only once
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should handle start() after stop() correctly", async () => {
        // First start
        await router.start("/home");

        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");

        // Stop
        router.stop();

        expect(router.isActive()).toBe(false);
        expect(router.getState()).toBeUndefined();

        // Second start should work
        await router.start("/users");

        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("users");
      });

      it("should handle multiple stop/start cycles", async () => {
        const cycles = 5;
        // Use routes that actually exist in test router config (without params)
        const routes = ["home", "users", "orders", "sign-in", "settings"];

        for (let i = 0; i < cycles; i++) {
          await router.start(`/${routes[i]}`);

          expect(router.isActive()).toBe(true);

          router.stop();

          expect(router.isActive()).toBe(false);
          expect(router.getState()).toBeUndefined();
        }
      });

      it("should block concurrent start() during async transition (isActive check)", async () => {
        // Issue #50: Test that isActive() check blocks concurrent start() calls
        // during an async transition (when isActive=true but isStarted=false)
        let resolveMiddleware: () => void;
        const middlewarePromise = new Promise<void>((resolve) => {
          resolveMiddleware = resolve;
        });

        // Add async guard that delays the transition
        lifecycle.addActivateGuard("home", () => async () => {
          await middlewarePromise;

          return true;
        });

        // Start first transition (will be pending in middleware)
        const startPromise = router.start("/home");

        // At this point: isActive()=true, isStarted()=false
        expect(router.isActive()).toBe(true);

        // Try second start() - should fail immediately with ROUTER_ALREADY_STARTED
        try {
          await router.start("/users");

          expect.fail("Should have thrown");
        } catch (error: any) {
          expect(error.code).toBe(errorCodes.ROUTER_ALREADY_STARTED);
        }

        // Complete the first transition
        resolveMiddleware!();
        await middlewarePromise;

        // Now first transition completes
        const result = await startPromise;

        expect(result).toBeDefined();
        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should allow start() after failed async transition resets isActive", async () => {
        lifecycle.addActivateGuard(
          "home",
          () => () => Promise.reject(new Error("Guard error")),
        );

        try {
          await router.start("/home");
        } catch {
          // Expected to fail
        }

        expect(router.isActive()).toBe(false);

        await router.start("/users");

        expect(router.isActive()).toBe(true);
        expect(router.getState()?.name).toBe("users");
      });
    });
  });

  describe("Issue #44: router.start() should NOT silently fallback to defaultRoute on transition errors", () => {
    describe("transition error handling when defaultRoute is set", () => {
      beforeEach(async () => {
        router = createTestRouter({ defaultRoute: "home" });
        lifecycle = getLifecycleApi(router);
        await router.start("/home");
      });

      it("should return transition error to callback instead of falling back silently", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        try {
          await router.navigate("/users/list");

          expect.fail("Should have thrown");
        } catch {
          // Error should be reported
        }
      });

      it("should emit TRANSITION_ERROR event when transition fails", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const transitionErrorListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        try {
          await router.navigate("/users/list");
        } catch {
          // Expected
        }

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
      });

      it("should NOT silently navigate to defaultRoute when transition fails", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        try {
          await router.navigate("/users/list");
        } catch {
          // Expected
        }

        // Should NOT have transitioned to defaultRoute (no fallback)
        expect(transitionSuccessListener).not.toHaveBeenCalled();

        // Router state should remain at home (from beforeEach)
        expect(router.getState()?.name).toBe("home");
      });

      it("should NOT emit TRANSITION_SUCCESS when transition fails", async () => {
        // Add middleware that blocks the transition
        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const transitionSuccessListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        try {
          await router.navigate("/users/list");
        } catch {
          // Expected
        }

        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      // Two-phase start - Router is NOT started if transition fails
      it("should NOT start router when transition fails (two-phase start)", async () => {
        router.stop();

        lifecycle.addActivateGuard("users.list", () => () => {
          throw new Error("Blocked");
        });

        const startListener = vi.fn();

        getPluginApi(router).addEventListener(
          events.ROUTER_START,
          startListener,
        );

        try {
          await router.start("/users/list");
        } catch {
          // Expected
        }

        expect(router.isActive()).toBe(false);
        expect(startListener).toHaveBeenCalledTimes(1);
      });

      // Note: TRANSITION_CANCELLED test was removed because it required mocking
      // navigateToState. TRANSITION_CANCELLED during start() is not a realistic
      // scenario since start() is synchronous.
    });
  });
});
