import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
} from "vitest";

import { errorCodes, events } from "router6";

import { createTestRouter } from "../../../helpers";

import type { Router } from "router6";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - route not found", () => {
  beforeEach(() => {
    router = createTestRouter();

    router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation to non-existent route", () => {
    it("should call callback with ROUTE_NOT_FOUND error", () => {
      const callback = vi.fn();

      router.navigate("nonexistent.route", callback);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );
    });

    it("should emit TRANSITION_ERROR event with ROUTE_NOT_FOUND error", () => {
      const onError = vi.fn();
      const callback = vi.fn();

      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      router.navigate("invalid.route.name", callback);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        undefined, // toState is undefined for invalid route
        expect.any(Object), // fromState (current state)
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }), // error
      );

      unsubError();
    });

    it("should return noop function", () => {
      const callback = vi.fn();

      const result = router.navigate("nonexistent", callback);

      expectTypeOf(result).toBeFunction();

      // Verify it's a noop function by calling it multiple times
      expect(() => {
        result();
        result();
        result();
      }).not.toThrowError();
    });

    it("should handle route with invalid namespace", () => {
      const callback = vi.fn();

      router.navigate("invalid.namespace.route", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );
    });

    it("should handle route with parameters when route not found", () => {
      const callback = vi.fn();

      router.navigate("nonexistent.route", { id: 123, name: "test" }, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );
    });

    it("should handle route with options when route not found", () => {
      const callback = vi.fn();
      const options = { replace: true, source: "manual" };

      router.navigate("invalid.route", {}, options, callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );
    });

    it("should emit TRANSITION_ERROR with current state as fromState", async () => {
      const onError = vi.fn();

      // Set up listener FIRST
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      // Navigate to a valid route first to establish fromState
      await new Promise<void>((resolve) => {
        router.navigate("users", {}, {}, (err) => {
          expect(err).toBeUndefined();

          resolve();
        });
      });

      // Clear any previous calls
      onError.mockClear();

      // Now try invalid route - listener is already set up
      router.navigate("invalid.route", (err) => {
        expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      });

      // TRANSITION_ERROR should have been called
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        undefined, // toState undefined for invalid route
        expect.objectContaining({
          name: "users", // fromState should be current state
        }),
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );

      unsubError();
    });

    it("should not emit TRANSITION_START for invalid route", () => {
      const onStart = vi.fn();
      const onError = vi.fn();

      const unsubStart = router.addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      router.navigate("invalid.route", noop);

      expect(onStart).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);

      unsubStart();
      unsubError();
    });

    it("should not emit TRANSITION_SUCCESS for invalid route", () => {
      const onSuccess = vi.fn();
      const onError = vi.fn();

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      router.navigate("invalid.route", noop);

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);

      unsubSuccess();
      unsubError();
    });

    it("should not call router.setState for invalid route", () => {
      const setStateSpy = vi.spyOn(router, "setState");

      router.navigate("invalid.route", noop);

      expect(setStateSpy).not.toHaveBeenCalled();
    });

    it("should not trigger guards or middleware for invalid route", () => {
      const guard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn();

      router.canActivate("users", () => guard);
      router.useMiddleware(() => middleware);

      router.navigate("invalid.route", noop);

      expect(guard).not.toHaveBeenCalled();
      expect(middleware).not.toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should handle multiple invalid route navigations", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const onError = vi.fn();

      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      router.navigate("invalid.route1", callback1);
      router.navigate("invalid.route2", callback2);

      expect(callback1).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
      expect(callback2).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );

      expect(onError).toHaveBeenCalledTimes(2);

      unsubError();
    });

    it("should handle empty route name", () => {
      const callback = vi.fn();

      router.navigate("", callback);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should return ROUTE_NOT_FOUND error with correct properties", () => {
      const callback = vi.fn();

      router.navigate("invalid.route", callback);

      const error = callback.mock.calls[0][0];

      expect(error).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
          // Add other expected error properties if any
        }),
      );

      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });

    it("should handle case-sensitive route names", () => {
      const callback = vi.fn();

      // Assuming routes are case-sensitive
      router.navigate("Users", callback); // capital U vs "users"

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should handle route name with special characters", () => {
      const callback = vi.fn();

      router.navigate("route-with-dashes", callback);
      router.navigate("route_with_underscores", callback);
      router.navigate("route@with#symbols", callback);

      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
      expect(callback).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
      expect(callback).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should handle navigation without callback for invalid route", () => {
      const onError = vi.fn();
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      // This should not throw even without callback
      expect(() => {
        const cancel = router.navigate("invalid.route");

        expectTypeOf(cancel).toBeFunction();
      }).not.toThrowError();

      expect(onError).toHaveBeenCalledTimes(1);

      unsubError();
    });

    it("should work correctly after trying invalid route", () => {
      const invalidCallback = vi.fn();
      const validCallback = vi.fn();

      // Try invalid route first
      router.navigate("invalid.route", invalidCallback);

      expect(invalidCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );

      // Then try valid route
      router.navigate("users", validCallback);

      expect(validCallback).toHaveBeenCalledWith(
        undefined, // no error
        expect.objectContaining({
          name: "users",
        }),
      );
    });
  });
});
