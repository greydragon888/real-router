import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - events transition start", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("TRANSITION_START event emission", () => {
    it("should emit TRANSITION_START with correct toState and fromState parameters", () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigate to initial state to establish fromState
      router.navigate("users", {}, {}, (err) => {
        expect(err).toBeUndefined();

        onStart.mockClear();

        // Navigate to different state to trigger event with both toState and fromState
        router.navigate("users.view", { id: 42 }, (err) => {
          expect(err).toBeUndefined();

          // Verify TRANSITION_START was called with correct parameters
          expect(onStart).toHaveBeenCalledTimes(1);
          expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "users.view",
              params: { id: 42 },
              path: "/users/view/42",
            }), // toState
            expect.objectContaining({
              name: "users",
              params: {},
              path: "/users",
            }), // fromState
          );
        });
      });

      unsubStart();
    });

    it("should emit TRANSITION_START with correct fromState on navigation from initial state", () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigation from initial state (router starts at home by default)
      router.navigate("users.view", { id: 123 }, (err) => {
        expect(err).toBeUndefined();

        expect(onStart).toHaveBeenCalledTimes(1);
        expect(onStart).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "users.view",
            params: { id: 123 },
            path: "/users/view/123",
          }), // toState
          expect.objectContaining({
            name: "home", // router starts at home by default
            path: "/home",
          }), // fromState (initial state from router.start())
        );
      });

      unsubStart();
    });

    it("should emit TRANSITION_START before any guards or middleware execution", () => {
      const onStart = vi.fn();
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn().mockReturnValue(true);

      router.canActivate("users.view", () => canActivateGuard);
      router.useMiddleware(() => middleware);

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      router.navigate("users.view", { id: 99 }, (err) => {
        expect(err).toBeUndefined();

        // TRANSITION_START should be called before guards/middleware
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(canActivateGuard).toHaveBeenCalledTimes(1);
        expect(middleware).toHaveBeenCalledTimes(1);

        // Verify call order: TRANSITION_START should be first
        const startCallTime = onStart.mock.invocationCallOrder[0];
        const guardCallTime = canActivateGuard.mock.invocationCallOrder[0];
        const middlewareCallTime = middleware.mock.invocationCallOrder[0];

        expect(startCallTime).toBeLessThan(guardCallTime);
        expect(startCallTime).toBeLessThan(middlewareCallTime);
      });

      unsubStart();
      router.clearMiddleware();
    });

    it("should emit TRANSITION_START even when transition is later cancelled", () => {
      vi.useFakeTimers();

      const onStart = vi.fn();
      const onCancel = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const navigationCallback = vi.fn();

      // Set up async middleware
      router.useMiddleware(() => (_toState, _fromState, middlewareDone) => {
        setTimeout(middlewareDone, 50);
      });

      const cancel = router.navigate(
        "users.view",
        { id: 456 },
        navigationCallback,
      );

      // TRANSITION_START should be emitted immediately
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(0);

      // Cancel the transition
      cancel();

      // TRANSITION_CANCEL should be emitted
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Advance timers to complete any pending operations
      vi.advanceTimersByTime(100);

      // Navigation callback should have been called with cancellation error
      expect(navigationCallback).toHaveBeenCalledWith(
        expect.objectContaining({ code: errorCodes.TRANSITION_CANCELLED }),
      );

      // Cleanup
      unsubStart();
      unsubCancel();
      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should emit TRANSITION_START even when transition is later blocked by guards", () => {
      const onStart = vi.fn();
      const onError = vi.fn();
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.canActivate("users.view", () => blockingGuard);

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      router.navigate("users.view", { id: 789 }, (err) => {
        expect(err?.code).toBe(errorCodes.CANNOT_ACTIVATE);

        // TRANSITION_START should still have been emitted
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(onStart).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "users.view",
            params: { id: 789 },
            path: "/users/view/789",
          }),
          expect.objectContaining({
            name: "home",
            params: {},
            path: "/home",
          }), // fromState
        );

        // Error event should also be emitted
        expect(onError).toHaveBeenCalledTimes(1);
      });

      unsubStart();
      unsubError();
    });

    it("should emit TRANSITION_START for nested route navigation", () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigate to parent route first
      router.navigate("orders", {}, {}, (err) => {
        expect(err).toBeUndefined();

        onStart.mockClear();

        // Navigate to nested route
        router.navigate("orders.pending", {}, (err) => {
          expect(err).toBeUndefined();

          expect(onStart).toHaveBeenCalledTimes(1);
          expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "orders.pending",
              path: "/orders/pending",
            }), // toState
            expect.objectContaining({
              name: "orders",
              path: "/orders",
            }), // fromState
          );
        });
      });

      unsubStart();
    });

    it("should emit TRANSITION_START with navigation options in toState meta", () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      const navigationOptions = { replace: true, source: "test" };

      router.navigate("profile", {}, navigationOptions, (err) => {
        expect(err).toBeUndefined();

        expect(onStart).toHaveBeenCalledTimes(1);

        const [toState] = onStart.mock.calls[0];

        expect(toState).toStrictEqual(
          expect.objectContaining({
            name: "profile",
            meta: expect.objectContaining({
              options: expect.objectContaining(navigationOptions),
            }),
          }),
        );
      });

      unsubStart();
    });

    it("should emit TRANSITION_START for same route navigation with force option", () => {
      const onStart = vi.fn();

      // Navigate to route first
      router.navigate("profile", {}, {}, (err) => {
        expect(err).toBeUndefined();

        const unsubStart = router.addEventListener(
          events.TRANSITION_START,
          onStart,
        );

        // Navigate to same route with force
        router.navigate("profile", {}, { force: true }, (err) => {
          expect(err).toBeUndefined();

          expect(onStart).toHaveBeenCalledTimes(1);
          expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "profile",
              meta: expect.objectContaining({
                options: expect.objectContaining({ force: true }),
              }),
            }), // toState
            expect.objectContaining({
              name: "profile",
            }), // fromState (same route)
          );
        });

        unsubStart();
      });
    });

    it("should not emit TRANSITION_START when skipTransition option is set", () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      router.navigate("users", {}, { skipTransition: true }, (err, state) => {
        expect(err).toBeUndefined();
        expect(state?.name).toBe("users");

        // TRANSITION_START should not be emitted when skipTransition is true
        expect(onStart).not.toHaveBeenCalled();
      });

      unsubStart();
    });

    it("should not emit TRANSITION_START when navigation to same state without force/reload", () => {
      const onStart = vi.fn();

      // Navigate to route first
      router.navigate("orders", {}, {}, (err) => {
        expect(err).toBeUndefined();

        const unsubStart = router.addEventListener(
          events.TRANSITION_START,
          onStart,
        );

        // Try to navigate to same route without force/reload
        router.navigate("orders", {}, {}, (err) => {
          expect(err?.code).toBe(errorCodes.SAME_STATES);

          // TRANSITION_START should not be emitted for blocked same-state navigation
          expect(onStart).not.toHaveBeenCalled();
        });

        unsubStart();
      });
    });

    it("should not emit TRANSITION_START when router is not started", () => {
      router.stop();

      const onStart = vi.fn();
      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      router.navigate("users", (err) => {
        expect(err?.code).toBe(errorCodes.ROUTER_NOT_STARTED);

        // TRANSITION_START should not be emitted when router is not started
        expect(onStart).not.toHaveBeenCalled();
      });

      unsubStart();
      router.start(); // Restore for other tests
    });
  });
});
