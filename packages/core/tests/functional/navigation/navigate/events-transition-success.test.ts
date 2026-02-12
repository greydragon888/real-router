import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - events transition success", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("TRANSITION_SUCCESS event emission", () => {
    it("should emit TRANSITION_SUCCESS with correct newState and fromState parameters", () => {
      const onSuccess = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Navigate to initial state to establish fromState
      router.navigate("users", {}, {}, (err, fromState) => {
        expect(err).toBeUndefined();

        onSuccess.mockClear();

        // Navigate to different state to trigger TRANSITION_SUCCESS
        router.navigate("users.view", { id: 42 }, (err, newState) => {
          expect(err).toBeUndefined();
          expect(newState).toBeDefined();

          // Verify TRANSITION_SUCCESS was called with correct parameters
          expect(onSuccess).toHaveBeenCalledTimes(1);
          expect(onSuccess).toHaveBeenCalledWith(newState, fromState, {});
        });
      });

      unsubSuccess();
    });

    it("should call navigation callback with done(undefined, newState)", () => {
      vi.useFakeTimers();

      const navigationCallback = vi.fn();

      router.navigate("settings", {}, {}, navigationCallback);

      // Advance time to complete navigation
      vi.advanceTimersByTime(0);

      expect(navigationCallback).toHaveBeenCalledTimes(1);
      expect(navigationCallback).toHaveBeenCalledWith(
        undefined, // error should be undefined
        expect.objectContaining({
          name: "settings",
          path: "/settings",
        }), // newState
      );

      vi.useRealTimers();
    });

    it("should emit TRANSITION_SUCCESS for nested route navigation", () => {
      const onSuccess = vi.fn();

      // Navigate to parent route first
      router.navigate("orders", {}, {}, (err, fromState) => {
        expect(err).toBeUndefined();

        const unsubSuccess = router.addEventListener(
          events.TRANSITION_SUCCESS,
          onSuccess,
        );

        // Navigate to nested route
        router.navigate("orders.pending", {}, (err, newState) => {
          expect(err).toBeUndefined();

          expect(onSuccess).toHaveBeenCalledTimes(1);
          expect(onSuccess).toHaveBeenCalledWith(newState, fromState, {});
        });

        unsubSuccess();
      });
    });

    it("should emit TRANSITION_SUCCESS with navigation options in newState meta", () => {
      const onSuccess = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      const navigationOptions = { replace: true, source: "test" };

      router.navigate("profile", {}, navigationOptions, (err, newState) => {
        expect(err).toBeUndefined();

        expect(onSuccess).toHaveBeenCalledTimes(1);

        const [successNewState] = onSuccess.mock.calls[0];

        expect(successNewState).toStrictEqual(
          expect.objectContaining({
            name: "profile",
            meta: expect.objectContaining({
              options: expect.objectContaining(navigationOptions),
            }),
          }),
        );

        // Verify callback also receives state with options
        expect(newState).toStrictEqual(
          expect.objectContaining({
            name: "profile",
            meta: expect.objectContaining({
              options: expect.objectContaining(navigationOptions),
            }),
          }),
        );
      });

      unsubSuccess();
    });

    it("should emit TRANSITION_SUCCESS for same route navigation with force option", () => {
      // Navigate to route first
      router.navigate("profile", {}, {}, (err) => {
        expect(err).toBeUndefined();

        const onSuccess = vi.fn();
        const unsubSuccess = router.addEventListener(
          events.TRANSITION_SUCCESS,
          onSuccess,
        );

        // Navigate to same route with force
        router.navigate("profile", {}, { force: true }, (err, newState) => {
          expect(err).toBeUndefined();

          expect(onSuccess).toHaveBeenCalledTimes(1);
          expect(onSuccess).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "profile",
              meta: expect.objectContaining({
                options: expect.objectContaining({ force: true }),
              }),
            }), // newState
            expect.objectContaining({
              name: "profile",
            }), // fromState (same route),
            { force: true },
          );

          // Verify callback receives correct state
          expect(newState?.name).toBe("profile");
        });

        unsubSuccess();
      });
    });

    it("should emit TRANSITION_SUCCESS after all guards and middleware pass", () => {
      const onSuccess = vi.fn();
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const canDeactivateGuard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn().mockReturnValue(true);

      // Setup guards and middleware for different routes (not parent-child)
      router.addActivateGuard("profile", () => canActivateGuard);
      router.addDeactivateGuard("users", () => canDeactivateGuard);
      router.useMiddleware(() => middleware);

      // Navigate to users first
      router.navigate("users", {}, {}, (err) => {
        expect(err).toBeUndefined();

        const unsubSuccess = router.addEventListener(
          events.TRANSITION_SUCCESS,
          onSuccess,
        );

        // Reset mocks
        canActivateGuard.mockClear();
        canDeactivateGuard.mockClear();
        middleware.mockClear();
        onSuccess.mockClear();

        // Navigate to profile (different route, not child of users)
        router.navigate("profile", {}, (err) => {
          expect(err).toBeUndefined();

          // All guards/middleware should have been called
          expect(canDeactivateGuard).toHaveBeenCalledTimes(1); // Called when leaving "users"
          expect(canActivateGuard).toHaveBeenCalledTimes(1); // Called when entering "profile"
          expect(middleware).toHaveBeenCalledTimes(1);

          // TRANSITION_SUCCESS should be called after guards/middleware
          expect(onSuccess).toHaveBeenCalledTimes(1);

          // Verify call order: guards/middleware before TRANSITION_SUCCESS
          const deactivateCallTime =
            canDeactivateGuard.mock.invocationCallOrder[0];
          const activateCallTime = canActivateGuard.mock.invocationCallOrder[0];
          const middlewareCallTime = middleware.mock.invocationCallOrder[0];
          const successCallTime = onSuccess.mock.invocationCallOrder[0];

          expect(deactivateCallTime).toBeLessThan(successCallTime);
          expect(activateCallTime).toBeLessThan(successCallTime);
          expect(middlewareCallTime).toBeLessThan(successCallTime);
        });

        unsubSuccess();
      });

      router.clearMiddleware();
    });

    it("should not emit TRANSITION_SUCCESS when transition fails", () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.addActivateGuard("users.view", () => blockingGuard);

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      try {
        await router.navigate("users.view", { id: 789 });

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.CANNOT_ACTIVATE);
      }

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);

      unsubSuccess();
      unsubError();
    });

    it("should not emit TRANSITION_SUCCESS when transition is cancelled", async () => {
      expect.hasAssertions();

      vi.useFakeTimers();

      const onSuccess = vi.fn();
      const onCancel = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      // Set up async middleware to allow cancellation
      router.useMiddleware(() => (_toState, _fromState, done) => {
        setTimeout(done, 50); // Delay to allow cancellation
      });

      const promise = router.navigate("users.view", { id: 456 });
      const cancel = () => router.cancel();

      // Cancel immediately
      cancel();

      // Advance time to ensure middleware timer runs
      await vi.runAllTimersAsync();

      try {
        await promise;

        expect.fail("Should have been cancelled");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }

      // Now assertions
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);

      // Cleanup
      unsubSuccess();
      unsubCancel();

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should not emit TRANSITION_SUCCESS when navigation to same state without force", async () => {
      const onSuccess = vi.fn();

      // Navigate to route first
      await router.navigate("orders", {}, {});

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Try to navigate to same route without force
      try {
        await router.navigate("orders", {}, {});

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.SAME_STATES);
      }

      expect(onSuccess).not.toHaveBeenCalled();

      unsubSuccess();
    });

    it("should not emit TRANSITION_SUCCESS when router is not started", async () => {
      router.stop();

      const onSuccess = vi.fn();
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }

      // TRANSITION_SUCCESS should not be emitted when router is not started
      expect(onSuccess).not.toHaveBeenCalled();

      unsubSuccess();
      router.start(); // Restore for other tests
    });

    it("should emit TRANSITION_SUCCESS with correct state after redirect", () => {
      const onSuccess = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Set up redirect from orders to profile
      router.addActivateGuard("orders", () => () => {
        return { name: "profile", params: {}, path: "/profile" };
      });

      router.navigate("orders", {}, {}, (err, finalState) => {
        expect(err).toBeUndefined();
        expect(finalState?.name).toBe("profile");

        // TRANSITION_SUCCESS should be emitted with final redirected state
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledWith(
          expect.objectContaining(finalState), // (after redirect)
          expect.objectContaining({
            name: "home", // fromState
          }),
          {},
        );

        // Callback should receive final state
        expect(finalState).toStrictEqual(
          expect.objectContaining({
            name: "profile",
            path: "/profile",
          }),
        );
      });

      unsubSuccess();
    });
  });
});
