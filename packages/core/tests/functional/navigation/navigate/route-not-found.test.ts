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
    it("should call callback with ROUTE_NOT_FOUND error", async () => {
      await new Promise<void>((resolve) => {
        router.navigate("nonexistent.route", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          resolve();
        });
      });
    });

    it("should emit TRANSITION_ERROR event with ROUTE_NOT_FOUND error", async () => {
      const onError = vi.fn();

      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await new Promise<void>((resolve) => {
        router.navigate("invalid.route.name", (err) => {
          resolve();
        });
      });

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

    it("should return noop function", async () => {
      const result = await new Promise<any>((resolve) => {
        const cancel = router.navigate("nonexistent", () => {
          resolve(cancel);
        });
      });

      expectTypeOf(result).toBeFunction();

      // Verify it's a noop function by calling it multiple times
      expect(() => {
        result();
        result();
        result();
      }).not.toThrowError();
    });

    it("should handle route with invalid namespace", async () => {
      await new Promise<void>((resolve) => {
        router.navigate("invalid.namespace.route", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          resolve();
        });
      });
    });

    it("should handle route with parameters when route not found", async () => {
      await new Promise<void>((resolve) => {
        router.navigate(
          "nonexistent.route",
          { id: 123, name: "test" },
          (err) => {
            expect(err).toBeDefined();
            expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
            resolve();
          },
        );
      });
    });

    it("should handle route with options when route not found", async () => {
      const options = { replace: true, source: "manual" };

      await new Promise<void>((resolve) => {
        router.navigate("invalid.route", {}, options, (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          resolve();
        });
      });
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

    it("should not emit TRANSITION_START for invalid route", async () => {
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

      await new Promise<void>((resolve) => {
        router.navigate("invalid.route", () => {
          resolve();
        });
      });

      expect(onStart).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);

      unsubStart();
      unsubError();
    });

    it("should not emit TRANSITION_SUCCESS for invalid route", async () => {
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

      await new Promise<void>((resolve) => {
        router.navigate("invalid.route", () => {
          resolve();
        });
      });

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);

      unsubSuccess();
      unsubError();
    });

    it("should not trigger guards or middleware for invalid route", async () => {
      const guard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn();

      router.addActivateGuard("users", () => guard);
      router.useMiddleware(() => middleware);

      await new Promise<void>((resolve) => {
        router.navigate("invalid.route", () => {
          resolve();
        });
      });

      expect(guard).not.toHaveBeenCalled();
      expect(middleware).not.toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should handle multiple invalid route navigations", async () => {
      const onError = vi.fn();

      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await new Promise<void>((resolve) => {
        let count = 0;
        router.navigate("invalid.route1", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          count++;
          if (count === 2) resolve();
        });
        router.navigate("invalid.route2", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          count++;
          if (count === 2) resolve();
        });
      });

      expect(onError).toHaveBeenCalledTimes(2);

      unsubError();
    });

    it("should handle empty route name", async () => {
      await new Promise<void>((resolve) => {
        router.navigate("", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          resolve();
        });
      });
    });

    it("should return ROUTE_NOT_FOUND error with correct properties", async () => {
      const error = await new Promise<any>((resolve) => {
        router.navigate("invalid.route", (err) => {
          resolve(err);
        });
      });

      expect(error).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
          // Add other expected error properties if any
        }),
      );

      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
    });

    it("should handle case-sensitive route names", async () => {
      // Assuming routes are case-sensitive
      await new Promise<void>((resolve) => {
        router.navigate("Users", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          resolve();
        });
      });
    });

    it("should handle route name with special characters", async () => {
      const errors: any[] = [];

      await new Promise<void>((resolve) => {
        let count = 0;
        const callback = (err: any) => {
          errors.push(err);
          count++;
          if (count === 3) resolve();
        };

        router.navigate("route-with-dashes", callback);
        router.navigate("route_with_underscores", callback);
        router.navigate("route@with#symbols", callback);
      });

      expect(errors).toHaveLength(3);
      expect(errors[0]).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
      expect(errors[1]).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
      expect(errors[2]).toStrictEqual(
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
          message: "ROUTE_NOT_FOUND",
        }),
      );
    });

    it("should handle navigation without callback for invalid route", async () => {
      const onError = vi.fn();
      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      // This should not throw even without callback
      await new Promise<void>((resolve) => {
        expect(() => {
          const cancel = router.navigate("invalid.route");

          expectTypeOf(cancel).toBeFunction();
        }).not.toThrowError();

        // Give it a moment for the error event to fire
        setTimeout(resolve, 0);
      });

      expect(onError).toHaveBeenCalledTimes(1);

      unsubError();
    });

    it("should work correctly after trying invalid route", async () => {
      await new Promise<void>((resolve) => {
        let count = 0;
        router.navigate("invalid.route", (err) => {
          expect(err).toBeDefined();
          expect(err?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
          count++;
          if (count === 2) resolve();
        });

        router.navigate("users", (err, state) => {
          expect(err).toBeUndefined();
          expect(state).toBeDefined();
          expect(state?.name).toBe("users");
          count++;
          if (count === 2) resolve();
        });
      });
    });
  });
});
