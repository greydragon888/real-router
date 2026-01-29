import { logger } from "@real-router/logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State, DoneFn } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - concurrent navigation", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation cancellation", () => {
    beforeEach(() => {
      vi.useRealTimers(); // Use real timers for async operations
    });

    afterEach(() => {
      router.clearMiddleware();
      vi.restoreAllMocks();
    });

    it("should return cancel function from router.navigate", () => {
      const cancel = router.navigate("users", noop);

      expectTypeOf(cancel).toBeFunction();

      expect(cancel.name).toBe("cancel"); // Optional: check function name
    });

    it("should cancel navigation and call callback with TRANSITION_CANCELLED error", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      // Add async middleware to make navigation cancellable
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50); // 50ms delay
      });

      const cancel = router.navigate("users", (err) => {
        expect(err).toBeDefined();
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);

        callback(err);
      });

      // Cancel after 10ms (before middleware completes)
      setTimeout(cancel, 10);

      // Advance timers to trigger cancellation
      vi.advanceTimersByTime(10);
      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.TRANSITION_CANCELLED,
        }),
      );

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should emit TRANSITION_CANCEL event when navigation is cancelled", () => {
      vi.useFakeTimers();

      const onCancel = vi.fn();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const cancel = router.navigate("profile", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });

      setTimeout(cancel, 15);

      // Advance timers
      vi.advanceTimersByTime(15);
      vi.advanceTimersByTime(50);

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "profile",
        }), // toState
        expect.any(Object), // fromState
      );

      unsubCancel();
      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should cancel navigation during async guard execution", async () => {
      vi.useFakeTimers();

      const asyncGuard = vi.fn().mockImplementation(
        () => () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 60);
          }),
      );

      router.canActivate("orders", asyncGuard);

      const callback = vi.fn((err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });

      const cancel = router.navigate("orders", callback);

      // Cancel while guard is executing
      setTimeout(cancel, 20);

      // Run all timers and microtasks
      await vi.runAllTimersAsync();

      // Assertions
      expect(asyncGuard).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("should cancel navigation during multiple async middleware", async () => {
      vi.useFakeTimers();

      const middleware1 = vi
        .fn()
        .mockImplementation(
          () => (_toState: State, _fromState: State, done: DoneFn) => {
            setTimeout(done, 30);
          },
        );

      const middleware2 = vi
        .fn()
        .mockImplementation(
          () => (_toState: State, _fromState: State, done: DoneFn) => {
            setTimeout(done, 30);
          },
        );

      router.useMiddleware(middleware1);
      router.useMiddleware(middleware2);

      const cancel = router.navigate("settings", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
        // First middleware should have been called
        expect(middleware1).toHaveBeenCalledTimes(1);
      });

      // Cancel during middleware execution
      setTimeout(cancel, 25);

      // Advance timers
      await vi.runAllTimersAsync();

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should prioritize cancellation over other errors", async () => {
      vi.useFakeTimers();

      // Set up failing guard
      const failingGuard = vi.fn().mockImplementation(
        () => () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error("Guard failed"));
            }, 100);
          }),
      );

      router.canActivate("admin", failingGuard);

      const cancel = router.navigate("admin", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
        // Cancellation error should take priority over guard error
      });

      // Cancel before guard failure
      setTimeout(cancel, 50);

      // Advance timers
      await vi.runAllTimersAsync();

      vi.useRealTimers();
    });

    it("should not cancel already completed navigation", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      // Fast middleware that completes quickly
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 10);
      });

      const cancel = router.navigate("users", (err) => {
        // Navigation should succeed
        expect(err).toBeUndefined();

        callback(err);

        // Try to cancel after completion - should have no effect
        cancel();
      });

      // Advance time for navigation to complete
      vi.advanceTimersByTime(10);

      // Try to cancel after navigation completes
      setTimeout(cancel, 50);
      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(undefined);

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should handle cancel function called multiple times", () => {
      vi.useFakeTimers();

      const callback = vi.fn();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigate("profile", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);

        callback();
      });

      // Call cancel multiple times
      setTimeout(() => {
        cancel();
        cancel(); // Second call should be safe
        cancel(); // Third call should be safe
      }, 20);

      // Advance timers
      vi.advanceTimersByTime(20);
      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledTimes(1);

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should cancel navigation and not emit TRANSITION_SUCCESS", () => {
      vi.useFakeTimers();

      const onSuccess = vi.fn();
      const onCancel = vi.fn();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 60);
      });

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const cancel = router.navigate("orders", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });

      setTimeout(cancel, 25);

      // Advance timers
      vi.advanceTimersByTime(25);
      vi.advanceTimersByTime(60);

      // TRANSITION_SUCCESS should not be emitted
      expect(onSuccess).not.toHaveBeenCalled();

      // TRANSITION_CANCEL should be emitted
      expect(onCancel).toHaveBeenCalledTimes(1);

      unsubSuccess();
      unsubCancel();
      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should cancel navigation and not call router.setState", () => {
      vi.useFakeTimers();

      const setStateSpy = vi.spyOn(router, "setState");

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigate("settings", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });

      setTimeout(cancel, 20);

      // Advance timers
      vi.advanceTimersByTime(20);
      vi.advanceTimersByTime(50);

      // setState should not be called for cancelled navigation
      expect(setStateSpy).not.toHaveBeenCalled();

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should cancel navigation with custom navigation options", () => {
      vi.useFakeTimers();

      const onCancel = vi.fn();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const navigationOptions = { replace: true, source: "test" };

      const cancel = router.navigate(
        "profile",
        {},
        navigationOptions,
        (err) => {
          expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
        },
      );

      setTimeout(cancel, 20);

      // Advance timers
      vi.advanceTimersByTime(20);
      vi.advanceTimersByTime(50);

      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "profile",
        }), // toState
        expect.objectContaining({
          name: "home",
        }), // fromState
      );

      unsubCancel();
      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should handle cancellation when router is stopped during navigation", () => {
      vi.useFakeTimers();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50);
      });

      const cancel = router.navigate("users", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });

      setTimeout(() => {
        router.stop(); // Stop router during navigation
        cancel(); // Cancel should still work
      }, 20);

      // Advance timers
      vi.advanceTimersByTime(20);
      vi.advanceTimersByTime(50);

      router.start(); // Restore for other tests
      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should return different cancel functions for concurrent navigations", () => {
      expect.hasAssertions();

      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 100);
      });

      const cancel1 = router.navigate("users", noop);
      const cancel2 = router.navigate("profile", noop); // Should cancel previous

      expect(cancel1).toBeInstanceOf(Function);
      expect(cancel2).toBeInstanceOf(Function);
      expect(cancel1).not.toBe(cancel2); // Different functions

      // Clean up
      cancel1();
      cancel2();
    });

    it("should handle cancellation during redirect scenarios", () => {
      vi.spyOn(logger, "error").mockImplementation(noop);
      vi.useFakeTimers();

      // Set up redirect
      router.canActivate("orders", () => () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ name: "profile", params: {}, path: "/profile" });
          }, 40);
        });
      });

      const cancel = router.navigate("orders", (err) => {
        expect(err?.code).toBe(errorCodes.TRANSITION_CANCELLED);
      });

      // Cancel during redirect processing
      setTimeout(cancel, 20);

      // Advance timers
      vi.advanceTimersByTime(20); // Trigger cancellation
      vi.advanceTimersByTime(40); // Complete redirect processing

      vi.useRealTimers();
    });

    it("should prioritise cancellation errors", async () => {
      vi.useFakeTimers();

      router.stop();

      router.canActivate(
        "admin",
        () => () =>
          new Promise((_resolve, reject) => {
            setTimeout(reject, 20);
          }),
      );

      router.start("");

      const callback = vi.fn((err) => {
        expect(err?.code).toStrictEqual(errorCodes.TRANSITION_CANCELLED);
      });

      const cancel = router.navigate("admin", callback);

      setTimeout(cancel, 10);

      await vi.runAllTimersAsync();

      expect(callback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe("Issue #56: isNavigating() returns true during TRANSITION_START (FIXED)", () => {
    /**
     * FIXED: navigating flag is now set BEFORE emitting TRANSITION_START
     *
     * File: navigation.ts
     * ```typescript
     * // Cancel previous transition
     * cancel();
     *
     * // Set navigating flag BEFORE emitting TRANSITION_START
     * navigating = true;
     *
     * // Emit TRANSITION_START (after navigating flag is set)
     * router.invokeEventListeners(events.TRANSITION_START, toState, fromState);
     * ```
     */

    it("should return true from isNavigating() during TRANSITION_START", () => {
      const freshRouter = createTestRouter();
      let isNavigatingDuringStart: boolean | null = null;

      freshRouter.start();

      freshRouter.addEventListener(events.TRANSITION_START, () => {
        isNavigatingDuringStart = freshRouter.isNavigating();
      });

      freshRouter.navigate("users");

      // FIXED: isNavigating() now returns true during TRANSITION_START
      expect(isNavigatingDuringStart).toBe(true);

      freshRouter.stop();
    });

    it("should return consistent isNavigating() state across all event phases", () => {
      const freshRouter = createTestRouter();
      const stateLog: { event: string; isNavigating: boolean }[] = [];

      freshRouter.start();

      freshRouter.addEventListener(events.TRANSITION_START, () => {
        stateLog.push({
          event: "TRANSITION_START",
          isNavigating: freshRouter.isNavigating(),
        });
      });

      freshRouter.addEventListener(events.TRANSITION_SUCCESS, () => {
        stateLog.push({
          event: "TRANSITION_SUCCESS",
          isNavigating: freshRouter.isNavigating(),
        });
      });

      freshRouter.navigate("users");

      // Consistent behavior:
      // TRANSITION_START: isNavigating = true (navigation in progress)
      // TRANSITION_SUCCESS: isNavigating = false (navigation finished)
      expect(stateLog).toStrictEqual([
        { event: "TRANSITION_START", isNavigating: true },
        { event: "TRANSITION_SUCCESS", isNavigating: false },
      ]);

      freshRouter.stop();
    });

    it("should allow listener to detect if another navigation is in progress", () => {
      const freshRouter = createTestRouter();
      const navigationAttempts: {
        route: string;
        wasNavigating: boolean;
      }[] = [];

      freshRouter.start();

      freshRouter.addEventListener(
        events.TRANSITION_START,
        (toState: State) => {
          navigationAttempts.push({
            route: toState.name,
            wasNavigating: freshRouter.isNavigating(),
          });

          // Try to start another navigation while first is "in progress"
          if (toState.name === "users") {
            freshRouter.navigate("admin");
          }
        },
      );

      freshRouter.navigate("users");

      // FIXED: isNavigating() now correctly reports true during TRANSITION_START
      // Both navigations show wasNavigating = true
      expect(navigationAttempts).toStrictEqual([
        { route: "users", wasNavigating: true },
        { route: "admin", wasNavigating: true },
      ]);

      freshRouter.stop();
    });

    it("should be false after sync navigation completes", () => {
      const freshRouter = createTestRouter();

      freshRouter.start();

      freshRouter.navigate("users");
      const isNavigatingAfterCall = freshRouter.isNavigating();

      // After navigate() returns for sync transitions, navigation is complete
      expect(isNavigatingAfterCall).toBe(false);

      freshRouter.stop();
    });
  });

  // Note: "Issue #57: Redundant buildState call" tests were removed because they
  // relied on spying on buildStateWithSegments facade method, which is now bypassed
  // by dependency injection. The optimization (single buildState call) is still
  // in place but cannot be verified via facade spy.
});
