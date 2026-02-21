import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - events transition success", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("TRANSITION_SUCCESS event emission", () => {
    it("should emit TRANSITION_SUCCESS with correct newState and fromState parameters", async () => {
      const onSuccess = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Navigate to initial state to establish fromState
      const fromState = await router.navigate("users");

      onSuccess.mockClear();

      // Navigate to different state to trigger TRANSITION_SUCCESS
      const newState = await router.navigate("users.view", { id: 42 });

      expect(newState).toBeDefined();

      // Verify TRANSITION_SUCCESS was called with correct parameters
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(newState, fromState, {});

      unsubSuccess();
    });

    it("should resolve with new state on successful navigation", async () => {
      vi.useFakeTimers();

      const newState = await router.navigate("settings");

      // Advance time to complete navigation
      vi.advanceTimersByTime(0);

      expect(newState).toStrictEqual(
        expect.objectContaining({
          name: "settings",
          path: "/settings",
        }),
      );

      vi.useRealTimers();
    });

    it("should emit TRANSITION_SUCCESS for nested route navigation", async () => {
      const onSuccess = vi.fn();

      // Navigate to parent route first
      const fromState = await router.navigate("orders");

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Navigate to nested route
      const newState = await router.navigate("orders.pending");

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(newState, fromState, {});

      unsubSuccess();
    });

    it("should emit TRANSITION_SUCCESS with navigation options in newState meta", async () => {
      const onSuccess = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      const navigationOptions = { replace: true, source: "test" };

      const newState = await router.navigate("profile", {}, navigationOptions);

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

      // Verify state also has options
      expect(newState).toStrictEqual(
        expect.objectContaining({
          name: "profile",
          meta: expect.objectContaining({
            options: expect.objectContaining(navigationOptions),
          }),
        }),
      );

      unsubSuccess();
    });

    it("should emit TRANSITION_SUCCESS for same route navigation with force option", async () => {
      // Navigate to route first
      await router.navigate("profile");

      const onSuccess = vi.fn();
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Navigate to same route with force
      const newState = await router.navigate("profile", {}, { force: true });

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

      // Verify state is correct
      expect(newState?.name).toBe("profile");

      unsubSuccess();
    });

    it("should emit TRANSITION_SUCCESS after all guards and middleware pass", async () => {
      const onSuccess = vi.fn();
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const canDeactivateGuard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn().mockReturnValue(true);

      // Setup guards and middleware for different routes (not parent-child)
      router.addActivateGuard("profile", () => canActivateGuard);
      router.addDeactivateGuard("users", () => canDeactivateGuard);
      router.useMiddleware(() => middleware);

      // Navigate to users first
      await router.navigate("users");

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
      await router.navigate("profile");

      // All guards/middleware should have been called
      expect(canDeactivateGuard).toHaveBeenCalledTimes(1); // Called when leaving "users"
      expect(canActivateGuard).toHaveBeenCalledTimes(1); // Called when entering "profile"
      expect(middleware).toHaveBeenCalledTimes(1);

      // TRANSITION_SUCCESS should be called after guards/middleware
      expect(onSuccess).toHaveBeenCalledTimes(1);

      // Verify call order: guards before TRANSITION_SUCCESS (middleware is post-commit, runs after)
      const deactivateCallTime = canDeactivateGuard.mock.invocationCallOrder[0];
      const activateCallTime = canActivateGuard.mock.invocationCallOrder[0];
      const successCallTime = onSuccess.mock.invocationCallOrder[0];

      expect(deactivateCallTime).toBeLessThan(successCallTime);
      expect(activateCallTime).toBeLessThan(successCallTime);
      // Middleware is post-commit (fire-and-forget), called after TRANSITION_SUCCESS

      unsubSuccess();
    });

    it("should not emit TRANSITION_SUCCESS when transition fails", async () => {
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

      router.addActivateGuard(
        "users.view",
        () => () =>
          new Promise((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 50),
          ),
      );

      const promise = router.navigate("users.view", { id: 456 });

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      try {
        await promise;

        expect.fail("Should have been cancelled");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);

      unsubSuccess();
      unsubCancel();

      await router.start("/home");
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
      await router.start("/home");
    });
  });
});
