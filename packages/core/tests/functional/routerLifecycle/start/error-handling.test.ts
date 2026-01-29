import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.start() - error handling", () => {
  beforeEach(() => {
    router = createTestRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("scenarios without a starting state", () => {
    describe("start without startPathOrState and without defaultRoute", () => {
      it("should emit TRANSITION_ERROR when no start state available", () => {
        // Create router without defaultRoute for this test
        // Empty string means no default route
        const routerWithoutDefault = createTestRouter({
          defaultRoute: "",
        });

        const transitionStartListener = vi.fn();
        const transitionSuccessListener = vi.fn();
        const transitionErrorListener = vi.fn();

        routerWithoutDefault.addEventListener(
          events.TRANSITION_START,
          transitionStartListener,
        );
        routerWithoutDefault.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );
        routerWithoutDefault.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        const callback = vi.fn();

        routerWithoutDefault.start(callback);

        expect(transitionStartListener).not.toHaveBeenCalled();
        expect(transitionSuccessListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const [toState, fromState, error] =
          transitionErrorListener.mock.calls[0];

        expect(toState).toBeUndefined();
        expect(fromState).toBeUndefined();
        expect(error.code).toBe(errorCodes.NO_START_PATH_OR_STATE);

        routerWithoutDefault.stop();
      });
    });

    describe("start without startPathOrState, but with defaultRoute", () => {
      it("should navigate to default route when no start state but defaultRoute exists", () => {
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        const result = router.start(callback);

        expect(router.isStarted()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(result).toBe(router);

        // Verify via event that default route was used with replace: true
        const [toState, , options] = transitionSuccessListener.mock.calls[0];

        expect(toState.name).toBe("home");
        expect(options).toStrictEqual({ replace: true });
      });

      it("should navigate to default route successfully", () => {
        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionSuccessListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        const result = router.start(callback);

        expect(router.isStarted()).toBe(true);
        expect(startListener).toHaveBeenCalledTimes(1);
        expect(transitionSuccessListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(result).toBe(router);

        const [error, state] = callback.mock.calls[0];

        expect(error).toBeUndefined();
        expect(state).toBeDefined();
        expect(state?.name).toBe("home");

        const currentState = router.getState();

        expect(currentState?.name).toBe("home");
      });

      // Issue #50: Two-phase start - Router is NOT started if default route navigation fails
      it("should NOT start router when default route navigation fails (two-phase start)", () => {
        // Set invalid default route
        router.setOption("defaultRoute", "nonexistent.route");

        const callback = vi.fn();
        const startListener = vi.fn();
        const transitionErrorListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);
        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        const result = router.start(callback);

        // Issue #50: Router is NOT started when default route fails
        expect(router.isStarted()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
        expect(transitionErrorListener).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(result).toBe(router);

        const [error] = callback.mock.calls[0];

        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });
    });
  });

  // Note: "protectedDone callback guard" tests were removed because they
  // required replacing navigateToState directly, which no longer works
  // with dependency injection. The protectedDone guard is tested implicitly
  // through the navigation namespace unit tests.;

  describe("error handling edge cases", () => {
    describe("event listener exceptions", () => {
      // NOTE: Event listener exceptions are CAUGHT by invokeFor() in observable.ts
      // and logged via logger.error(). They do NOT propagate to caller.
      // This is correct behavior - protects router from user code errors.

      it("should catch and log exception from ROUTER_START event listener", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Add listener that throws
        router.addEventListener(events.ROUTER_START, () => {
          throw new Error("Listener crashed");
        });

        // Exception should NOT propagate (caught internally)
        expect(() => {
          router.start("/home");
        }).not.toThrowError();

        // Router should be started successfully
        expect(router.isStarted()).toBe(true);
        expect(router.getState()).toBeDefined();

        // Error should be logged (format: logger.error("Router", "Error in listener for <event>:", Error))
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      it("should catch and log exception from TRANSITION_SUCCESS event listener", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // Add listener that throws on TRANSITION_SUCCESS
        router.addEventListener(events.TRANSITION_SUCCESS, () => {
          throw new Error("Success listener crashed");
        });

        // Exception should NOT propagate
        expect(() => {
          router.start("/home");
        }).not.toThrowError();

        // Router should be started successfully
        expect(router.isStarted()).toBe(true);

        // Error should be logged
        expect(errorSpy).toHaveBeenCalledWith(
          "Router",
          expect.stringMatching(/Error in listener for/),
          expect.any(Error),
        );

        errorSpy.mockRestore();
      });

      it("should catch and log exception from TRANSITION_ERROR event listener", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        router.setOption("allowNotFound", false);

        // Add listener that throws on TRANSITION_ERROR
        router.addEventListener(events.TRANSITION_ERROR, () => {
          throw new Error("Error listener crashed");
        });

        // Exception should NOT propagate when route not found
        expect(() => {
          router.start("/nonexistent/path");
        }).not.toThrowError();

        // Router should NOT be started (route not found)
        expect(router.isStarted()).toBe(false);

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

      it("should catch TypeError when string callback is invoked", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        // TypeScript prevents this at compile time, but runtime catches it
        expect(() => {
          // @ts-expect-error - testing invalid callback type
          router.start("/home", "not a function");
        }).not.toThrowError();

        // Router should be started (callback error doesn't break router)
        expect(router.isStarted()).toBe(true);

        // Error should be logged
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it("should catch TypeError when object callback is invoked", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        expect(() => {
          // @ts-expect-error - testing invalid callback type
          router.start("/home", { callback: true });
        }).not.toThrowError();

        expect(router.isStarted()).toBe(true);
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it("should catch TypeError when number callback is invoked", () => {
        const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

        expect(() => {
          // @ts-expect-error - testing invalid callback type
          router.start("/home", 123);
        }).not.toThrowError();

        expect(router.isStarted()).toBe(true);
        expect(errorSpy).toHaveBeenCalled();

        errorSpy.mockRestore();
      });

      it("should work correctly when second argument is undefined", () => {
        // undefined should be replaced with noop
        expect(() => {
          // @ts-expect-error - testing invalid callback type
          router.start("/home", undefined);
        }).not.toThrowError();

        expect(router.isStarted()).toBe(true);
      });

      it("should work correctly when second argument is null", () => {
        // null is falsy, so noop is used
        expect(() => {
          // @ts-expect-error - testing invalid callback type
          router.start("/home", null);
        }).not.toThrowError();

        expect(router.isStarted()).toBe(true);
      });
    });

    describe("concurrent start() calls", () => {
      it("should handle rapid sequential start() calls", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn();
        const callback3 = vi.fn();

        // First call should succeed
        router.start("/home", callback1);

        // Subsequent calls should fail with ROUTER_ALREADY_STARTED
        router.start("/users", callback2);
        router.start("/orders", callback3);

        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback1).toHaveBeenCalledWith(undefined, expect.any(Object));

        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledWith(
          expect.objectContaining({ code: errorCodes.ROUTER_ALREADY_STARTED }),
        );

        expect(callback3).toHaveBeenCalledTimes(1);
        expect(callback3).toHaveBeenCalledWith(
          expect.objectContaining({ code: errorCodes.ROUTER_ALREADY_STARTED }),
        );

        // Router should be in state from first call
        expect(router.getState()?.name).toBe("home");
      });

      it("should maintain consistent state during concurrent start attempts", () => {
        const startListeners: number[] = [];

        router.addEventListener(events.ROUTER_START, () => {
          startListeners.push(Date.now());
        });

        // Attempt multiple starts
        router.start("/home");
        router.start("/users");
        router.start("/orders");

        // ROUTER_START should only be emitted once
        expect(startListeners).toHaveLength(1);

        // Router should be started only once
        expect(router.isStarted()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should handle start() after stop() correctly", () => {
        const callback1 = vi.fn();
        const callback2 = vi.fn();

        // First start
        router.start("/home", callback1);

        expect(router.isStarted()).toBe(true);
        expect(router.getState()?.name).toBe("home");

        // Stop
        router.stop();

        expect(router.isStarted()).toBe(false);
        expect(router.getState()).toBeUndefined();

        // Second start should work
        router.start("/users", callback2);

        expect(router.isStarted()).toBe(true);
        expect(router.getState()?.name).toBe("users");

        expect(callback1).toHaveBeenCalledWith(undefined, expect.any(Object));
        expect(callback2).toHaveBeenCalledWith(undefined, expect.any(Object));
      });

      it("should handle multiple stop/start cycles", () => {
        const cycles = 5;
        // Use routes that actually exist in test router config (without params)
        const routes = ["home", "users", "orders", "sign-in", "settings"];

        for (let i = 0; i < cycles; i++) {
          const callback = vi.fn();

          router.start(`/${routes[i]}`, callback);

          expect(router.isStarted()).toBe(true);
          expect(callback).toHaveBeenCalledWith(undefined, expect.any(Object));

          router.stop();

          expect(router.isStarted()).toBe(false);
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

        // Add async middleware that delays the transition
        router.useMiddleware(() => () => middlewarePromise);

        const callback1 = vi.fn();
        const callback2 = vi.fn();

        // Start first transition (will be pending in middleware)
        router.start("/home", callback1);

        // At this point: isActive()=true, isStarted()=false
        expect(router.isActive()).toBe(true);
        expect(router.isStarted()).toBe(false);
        expect(callback1).not.toHaveBeenCalled();

        // Try second start() - should fail immediately with ROUTER_ALREADY_STARTED
        router.start("/users", callback2);

        expect(callback2).toHaveBeenCalledTimes(1);
        expect(callback2).toHaveBeenCalledWith(
          expect.objectContaining({ code: errorCodes.ROUTER_ALREADY_STARTED }),
        );

        // First callback still not called (pending)
        expect(callback1).not.toHaveBeenCalled();

        // Complete the first transition
        resolveMiddleware!();
        await middlewarePromise;

        // Now first transition completes
        expect(callback1).toHaveBeenCalledTimes(1);
        expect(callback1).toHaveBeenCalledWith(undefined, expect.any(Object));
        expect(router.isStarted()).toBe(true);
        expect(router.getState()?.name).toBe("home");
      });

      it("should allow start() after failed async transition resets isActive", async () => {
        // Issue #50: When async transition fails, isActive is reset
        // Next start() call should be allowed
        router.useMiddleware(
          () => () => Promise.reject(new Error("Middleware error")),
        );

        const callback1 = vi.fn();

        // First start fails in middleware
        router.start("/home", callback1);

        // Wait for async failure
        await vi.waitFor(() => {
          expect(callback1).toHaveBeenCalled();
        });

        expect(callback1).toHaveBeenCalledWith(
          expect.objectContaining({ code: "TRANSITION_ERR" }),
          undefined,
        );
        expect(router.isStarted()).toBe(false);
        expect(router.isActive()).toBe(false);

        // Clear middleware for second attempt
        router.clearMiddleware();

        const callback2 = vi.fn();

        // Second start should now work
        router.start("/users", callback2);

        expect(callback2).toHaveBeenCalledWith(undefined, expect.any(Object));
        expect(router.isStarted()).toBe(true);
        expect(router.getState()?.name).toBe("users");
      });
    });
  });

  describe("Issue #44: router.start() should NOT silently fallback to defaultRoute on transition errors", () => {
    describe("transition error handling when defaultRoute is set", () => {
      beforeEach(() => {
        router.setOption("defaultRoute", "home");
      });

      it("should return transition error to callback instead of falling back silently", () => {
        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

        const callback = vi.fn();

        router.start("/users/list", callback);

        expect(callback).toHaveBeenCalledTimes(1);

        const [error, state] = callback.mock.calls[0];

        // Error should be reported to callback
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
        expect(state).toBeUndefined();
      });

      it("should emit TRANSITION_ERROR event when transition fails", () => {
        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

        const transitionErrorListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_ERROR,
          transitionErrorListener,
        );

        router.start("/users/list");

        expect(transitionErrorListener).toHaveBeenCalledTimes(1);

        const error = transitionErrorListener.mock.calls[0][2];

        expect(error.code).toBe(errorCodes.TRANSITION_ERR);
      });

      it("should NOT silently navigate to defaultRoute when transition fails", () => {
        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list");

        // Should NOT have transitioned to defaultRoute (no fallback)
        expect(transitionSuccessListener).not.toHaveBeenCalled();

        // Router state should remain undefined
        expect(router.getState()).toBeUndefined();
      });

      it("should NOT emit TRANSITION_SUCCESS when transition fails", () => {
        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

        const transitionSuccessListener = vi.fn();

        router.addEventListener(
          events.TRANSITION_SUCCESS,
          transitionSuccessListener,
        );

        router.start("/users/list");

        expect(transitionSuccessListener).not.toHaveBeenCalled();
      });

      // Two-phase start - Router is NOT started if transition fails
      it("should NOT start router when transition fails (two-phase start)", () => {
        // Add middleware that blocks the transition
        router.useMiddleware(() => (toState) => {
          return toState.name !== "users.list"; // Block users.list
        });

        const startListener = vi.fn();

        router.addEventListener(events.ROUTER_START, startListener);

        router.start("/users/list");

        // Issue #50: Router is NOT started if transition fails
        // Two-phase start ensures isStarted() only returns true after successful transition
        expect(router.isStarted()).toBe(false);
        expect(startListener).not.toHaveBeenCalled();
      });

      // Note: TRANSITION_CANCELLED test was removed because it required mocking
      // navigateToState. TRANSITION_CANCELLED during start() is not a realistic
      // scenario since start() is synchronous.
    });
  });
});
