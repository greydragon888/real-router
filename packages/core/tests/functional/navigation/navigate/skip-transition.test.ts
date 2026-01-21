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

describe("router.navigate() - skip transition", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation with skipTransition option", () => {
    it("should call callback with new state when skipTransition is true", () => {
      const callback = vi.fn();

      router.navigate("users", {}, { skipTransition: true }, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        undefined, // no error
        expect.objectContaining({
          name: "users",
        }),
      );
    });

    it("should not change router state when skipTransition is true", () => {
      const initialState = router.getState();

      router.navigate("profile", {}, { skipTransition: true }, noop);

      const currentState = router.getState();

      expect(currentState).toStrictEqual(initialState);
    });

    it("should return noop function when skipTransition is true", () => {
      const callback = vi.fn();

      const result = router.navigate(
        "users",
        {},
        { skipTransition: true },
        callback,
      );

      expectTypeOf(result).toBeFunction();

      // Verify it's a noop function
      expect(() => {
        result();
        result();
        result();
      }).not.toThrowError();
    });

    it("should not call router.setState when skipTransition is true", () => {
      const setStateSpy = vi.spyOn(router, "setState");

      router.navigate("orders", {}, { skipTransition: true }, noop);

      expect(setStateSpy).not.toHaveBeenCalled();
    });

    it("should not emit any transition events when skipTransition is true", () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();
      const onCancel = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      router.navigate("profile", {}, { skipTransition: true }, noop);

      expect(onStart).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(onCancel).not.toHaveBeenCalled();

      unsubStart();
      unsubSuccess();
      unsubError();
      unsubCancel();
    });

    it("should handle skipTransition with route parameters", () => {
      const callback = vi.fn();
      const params = { id: 123, category: "electronics" };

      router.navigate("users.view", params, { skipTransition: true }, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users.view",
          params: expect.objectContaining(params),
        }),
      );
    });

    it("should not trigger guards when skipTransition is true", () => {
      const canActivateGuard = vi.fn().mockReturnValue(true);
      const canDeactivateGuard = vi.fn().mockReturnValue(true);

      router.canActivate("orders", () => canActivateGuard);
      router.canDeactivate("users", () => canDeactivateGuard);

      // Navigate to users first
      router.navigate("users", {}, {}, noop);

      // Clear guard calls
      canActivateGuard.mockClear();
      canDeactivateGuard.mockClear();

      // Navigate with skipTransition - guards should NOT be called
      router.navigate("orders", {}, { skipTransition: true }, noop);

      expect(canActivateGuard).not.toHaveBeenCalled();
      expect(canDeactivateGuard).not.toHaveBeenCalled();
    });

    it("should not trigger middleware when skipTransition is true", () => {
      const middleware = vi
        .fn()
        .mockImplementation(
          () => (_toState: State, _fromState: State, done: DoneFn) => {
            done();
          },
        );

      router.useMiddleware(() => middleware);

      router.navigate("settings", {}, { skipTransition: true }, noop);

      // Middleware should NOT be called with skipTransition
      expect(middleware).not.toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should work with combination of options when skipTransition is true", () => {
      const callback = vi.fn();
      const options = {
        skipTransition: true,
        replace: true,
        source: "manual",
      };

      router.navigate("profile", {}, options, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "profile",
          meta: expect.objectContaining({
            options: expect.objectContaining(options),
          }),
        }),
      );
    });

    it("should handle skipTransition for different route navigation", () => {
      const callback = vi.fn();

      // Navigate to profile first
      router.navigate("profile", {}, {}, noop);

      // Navigate to DIFFERENT route with skipTransition
      router.navigate("users", {}, { skipTransition: true }, callback);

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
        }),
      );
    });

    it("should handle same route navigation with skipTransition and force option", () => {
      const callback = vi.fn();

      // Navigate to profile first
      router.navigate("profile", {}, {}, noop);

      // Navigate to same route with skipTransition + force to bypass SAME_STATES check
      router.navigate(
        "profile",
        {},
        { skipTransition: true, force: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "profile",
        }),
      );
    });

    it("should handle skipTransition for invalid route", () => {
      const callback = vi.fn();

      router.navigate("invalid.route", {}, { skipTransition: true }, callback);

      // Should still get ROUTE_NOT_FOUND error even with skipTransition
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should not affect router state even with complex navigation", () => {
      const initialState = router.getState();

      // Multiple navigations with skipTransition
      router.navigate("users", {}, { skipTransition: true }, noop);
      router.navigate("profile", { id: 123 }, { skipTransition: true }, noop);
      router.navigate(
        "orders",
        {},
        { skipTransition: true, replace: true },
        noop,
      );

      const finalState = router.getState();

      expect(finalState).toStrictEqual(initialState);
    });

    it("should handle skipTransition without callback", () => {
      const initialState = router.getState();

      expect(() => {
        const cancel = router.navigate("users", {}, { skipTransition: true });

        expectTypeOf(cancel).toBeFunction();
      }).not.toThrowError();

      expect(router.getState()).toStrictEqual(initialState);
    });

    it("should return noop that is safe to call multiple times", () => {
      const callback = vi.fn();

      const cancel = router.navigate(
        "users",
        {},
        { skipTransition: true },
        callback,
      );

      // Calling noop multiple times should be safe
      expect(() => {
        cancel();
        cancel();
        cancel();
      }).not.toThrowError();

      // State should remain unchanged
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should work correctly after skipTransition navigation", () => {
      const skipCallback = vi.fn();
      const normalCallback = vi.fn();

      // First navigation with skipTransition
      router.navigate("users", {}, { skipTransition: true }, skipCallback);

      expect(skipCallback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: "users" }),
      );

      // Then normal navigation should work
      router.navigate("profile", {}, {}, normalCallback);

      expect(normalCallback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: "profile" }),
      );

      // Router state should be "profile" now
      expect(router.getState()?.name).toBe("profile");
    });

    it("should handle concurrent navigation with and without skipTransition", () => {
      const skipCallback = vi.fn();
      const normalCallback = vi.fn();

      // Start with normal navigation
      const cancel = router.navigate("users", {}, {}, normalCallback);

      // Immediately try skipTransition navigation (should not interfere)
      router.navigate("profile", {}, { skipTransition: true }, skipCallback);

      expect(skipCallback).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: "profile" }),
      );

      // Cancel the normal navigation
      cancel();
    });

    it("should preserve all route information in returned state", () => {
      const callback = vi.fn();
      const params = { id: 42, tab: "settings" };

      router.navigate("users.view", params, { skipTransition: true }, callback);

      const [error, state] = callback.mock.calls[0];

      expect(error).toBeUndefined();
      expect(state).toStrictEqual(
        expect.objectContaining({
          name: "users.view",
          params: expect.objectContaining(params),
          path: expect.any(String),
          meta: expect.objectContaining({
            options: expect.objectContaining({
              skipTransition: true,
            }),
          }),
        }),
      );
    });

    it("should handle skipTransition when router is stopped", () => {
      router.stop();

      const callback = vi.fn();

      router.navigate("users", {}, { skipTransition: true }, callback);

      // Should get ROUTER_NOT_STARTED error, skipTransition doesn't override this
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );

      router.start(); // Restore for other tests
    });
  });
});
