import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { events, errorCodes } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - events transition start", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("TRANSITION_START event emission", () => {
    it("should emit TRANSITION_START with correct toState and fromState parameters", async () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigate to initial state to establish fromState
      await router.navigate("users", {}, {});

      onStart.mockClear();

      // Navigate to different state to trigger event with both toState and fromState
      await router.navigate("users.view", { id: 42 });

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

      unsubStart();
    });

    it("should emit TRANSITION_START with correct fromState on navigation from initial state", async () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigation from initial state (router starts at home by default)
      await router.navigate("users.view", { id: 123 });

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

      unsubStart();
    });

    it("should emit TRANSITION_START before any guards or middleware execution", async () => {
      const onStart = vi.fn();
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn().mockReturnValue(true);

      router.addActivateGuard("users.view", () => canActivateGuard);
      router.useMiddleware(() => middleware);

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      await router.navigate("users.view", { id: 99 });

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

      unsubStart();
      router.clearMiddleware();
    });

    it("should emit TRANSITION_START even when transition is later cancelled", async () => {
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

      // Set up async middleware that only delays specific route
      router.useMiddleware(() => (toState) => {
        if (toState.name === "users.view") {
          return new Promise((resolve) => {
            setTimeout(resolve, 50);
          });
        }

        return true;
      });

      const firstNav = router.navigate("users.view", { id: 456 });

      // TRANSITION_START should be emitted immediately
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(0);

      // Start a second navigation while first is pending
      const secondNav = router.navigate("orders");

      await vi.runAllTimersAsync();

      // In the new Promise-based API, both navigations complete successfully
      const firstResult = await firstNav;

      expect(firstResult.name).toBe("users.view");

      const secondResult = await secondNav;

      expect(secondResult.name).toBe("orders");

      // TRANSITION_CANCEL is not emitted in the new API
      expect(onCancel).toHaveBeenCalledTimes(0);

      // Cleanup
      unsubStart();
      unsubCancel();
      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should emit TRANSITION_START even when transition is later blocked by guards", async () => {
      const onStart = vi.fn();
      const onError = vi.fn();
      const blockingGuard = vi.fn().mockReturnValue(false);

      router.addActivateGuard("users.view", () => blockingGuard);

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      try {
        await router.navigate("users.view", { id: 789 });

        expect.fail("Should have thrown error");
      } catch (error) {
        expect((error as any)?.code).toBe(errorCodes.CANNOT_ACTIVATE);

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
      }

      unsubStart();
      unsubError();
    });

    it("should emit TRANSITION_START for nested route navigation", async () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigate to parent route first
      await router.navigate("orders", {}, {});

      onStart.mockClear();

      // Navigate to nested route
      await router.navigate("orders.pending", {}, {});

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

      unsubStart();
    });

    it("should emit TRANSITION_START with navigation options in toState meta", async () => {
      const onStart = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      const navigationOptions = { replace: true, source: "test" };

      await router.navigate("profile", {}, navigationOptions);

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

      unsubStart();
    });

    it("should emit TRANSITION_START for same route navigation with force option", async () => {
      const onStart = vi.fn();

      // Navigate to route first
      await router.navigate("profile", {}, {});

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Navigate to same route with force
      await router.navigate("profile", {}, { force: true });

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

      unsubStart();
    });

    it("should not emit TRANSITION_START when navigation to same state without force/reload", async () => {
      const onStart = vi.fn();

      // Navigate to route first
      await router.navigate("orders", {}, {});

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      // Try to navigate to same route without force/reload
      try {
        await router.navigate("orders", {}, {});

        expect.fail("Should have thrown error");
      } catch (error) {
        expect((error as any)?.code).toBe(errorCodes.SAME_STATES);

        // TRANSITION_START should not be emitted for blocked same-state navigation
        expect(onStart).not.toHaveBeenCalled();
      }

      unsubStart();
    });

    it("should not emit TRANSITION_START when router is not started", async () => {
      router.stop();

      const onStart = vi.fn();
      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect((error as any)?.code).toBe(errorCodes.ROUTER_NOT_STARTED);

        // TRANSITION_START should not be emitted when router is not started
        expect(onStart).not.toHaveBeenCalled();
      }

      unsubStart();
      await router.start();
    });
  });
});
