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

import type { Router } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - router not started", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation when router is not started", () => {
    beforeEach(() => {
      // Ensure router is stopped before each test
      router.stop();
    });

    afterEach(() => {
      // Restore router state for other tests
      router.start();
    });

    it("should call callback with ROUTER_NOT_STARTED error", () => {
      const callback = vi.fn();

      router.navigate("users", callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
    });

    it("should return noop function when router is not started", () => {
      const callback = vi.fn();

      const result = router.navigate("users", callback);

      expectTypeOf(result).toBeFunction();

      // Verify it's a noop function by calling it multiple times
      expect(() => {
        result();
        result();
        result();
      }).not.toThrowError();

      // Calling the returned function should have no effect
      // (cannot easily test this directly, but it shouldn't cause errors)
    });

    it("should not continue navigation process", () => {
      const callback = vi.fn();
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

      // Set up event listeners to verify no navigation events
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

      router.navigate("users", callback);

      // Only callback should be called, no transition events
      expect(callback).toHaveBeenCalledTimes(1);
      expect(onStart).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      unsubStart();
      unsubSuccess();
      unsubError();
    });

    it("should handle navigation with parameters when router not started", () => {
      const callback = vi.fn();

      router.navigate("users.view", { id: 123 }, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
    });

    it("should handle navigation with options when router not started", () => {
      const callback = vi.fn();
      const options = { replace: true, source: "test" };

      router.navigate("profile", {}, options, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
    });

    it("should handle multiple navigate calls when router not started", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const cancel1 = router.navigate("users", callback1);
      const cancel2 = router.navigate("profile", callback2);
      const cancel3 = router.navigate("orders", callback3);

      // All callbacks should be called with the same error
      expect(callback1).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
      expect(callback2).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
      expect(callback3).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );

      // All should return noop functions
      expectTypeOf(cancel1).toBeFunction();
      expectTypeOf(cancel2).toBeFunction();
      expectTypeOf(cancel3).toBeFunction();
    });

    it("should not trigger guards or middleware when router not started", () => {
      const guard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn();

      router.canActivate("users", () => guard);
      router.useMiddleware(() => middleware);

      router.navigate("users", noop);

      expect(guard).not.toHaveBeenCalled();
      expect(middleware).not.toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should handle invalid route names when router not started", () => {
      const callback = vi.fn();

      router.navigate("nonexistent.route", callback);

      // Should still return ROUTER_NOT_STARTED, not ROUTE_NOT_FOUND
      // because router state check happens first
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
    });

    it("should return noop function that is safe to call", () => {
      const callback = vi.fn();

      const cancel = router.navigate("users", callback);

      // Verify calling the noop function doesn't throw or cause issues
      expect(() => {
        cancel();
      }).not.toThrowError();

      // Callback should still have been called with error
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );
    });

    it("should work correctly after router is started", () => {
      const callback = vi.fn();

      // Verify router is stopped
      expect(router.isActive()).toBe(false);

      router.navigate("users", callback);

      // Should get ROUTER_NOT_STARTED error
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );

      callback.mockClear();

      // Start router and try again
      router.start();

      expect(router.isActive()).toBe(true);

      router.navigate("users", callback);

      // Should now work normally (no error)
      expect(callback).toHaveBeenCalledWith(
        undefined, // no error
        expect.objectContaining({
          name: "users",
        }),
      );
    });

    it("should emit no events when router is not started", () => {
      const onTransitionStart = vi.fn();
      const onTransitionCancel = vi.fn();
      const onTransitionError = vi.fn();
      const onTransitionSuccess = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onTransitionStart,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onTransitionCancel,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onTransitionError,
      );
      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onTransitionSuccess,
      );

      router.navigate("users", noop);

      // No transition events should be emitted
      expect(onTransitionStart).not.toHaveBeenCalled();
      expect(onTransitionCancel).not.toHaveBeenCalled();
      expect(onTransitionError).not.toHaveBeenCalled();
      expect(onTransitionSuccess).not.toHaveBeenCalled();

      unsubStart();
      unsubCancel();
      unsubError();
      unsubSuccess();
    });

    it("should handle navigation without callback when router not started", () => {
      // This should not throw even without callback
      expect(() => {
        const cancel = router.navigate("users");

        expectTypeOf(cancel).toBeFunction();
      }).not.toThrowError();
    });

    it("should return ROUTER_NOT_STARTED error with correct properties", () => {
      const callback = vi.fn();

      router.navigate("users", callback);

      const error = callback.mock.calls[0][0];

      expect(error).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTER_NOT_STARTED,
          message: "NOT_STARTED",
        }),
      );

      expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
    });
  });
});
