import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - route not found", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation to non-existent route", () => {
    it("should call callback with ROUTE_NOT_FOUND error", async () => {
      try {
        await router.navigate("nonexistent.route");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should emit TRANSITION_ERROR event with ROUTE_NOT_FOUND error", async () => {
      const onError = vi.fn();

      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      try {
        await router.navigate("invalid.route.name");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        undefined,
        expect.any(Object),
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );

      unsubError();
    });

    it("should return noop function", async () => {
      try {
        await router.navigate("nonexistent");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should handle route with invalid namespace", async () => {
      try {
        await router.navigate("invalid.namespace.route");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should handle route with parameters when route not found", async () => {
      try {
        await router.navigate("nonexistent.route", { id: 123, name: "test" });

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should handle route with options when route not found", async () => {
      const options = { replace: true, source: "manual" };

      try {
        await router.navigate("invalid.route", {}, options);

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should emit TRANSITION_ERROR with current state as fromState", async () => {
      const onError = vi.fn();

      const unsubError = router.addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await router.navigate("users", {}, {});

      onError.mockClear();

      try {
        await router.navigate("invalid.route");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error?.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({
          name: "users",
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

      try {
        await router.navigate("invalid.route");
      } catch {
        // Expected
      }

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

      try {
        await router.navigate("invalid.route");
      } catch {
        // Expected
      }

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

      try {
        await router.navigate("invalid.route");
      } catch {
        // Expected
      }

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

      try {
        await router.navigate("invalid.route1");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      try {
        await router.navigate("invalid.route2");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      expect(onError).toHaveBeenCalledTimes(2);

      unsubError();
    });

    it("should handle empty route name", async () => {
      try {
        await router.navigate("");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should return ROUTE_NOT_FOUND error with correct properties", async () => {
      try {
        await router.navigate("invalid.route");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTE_NOT_FOUND,
            message: "ROUTE_NOT_FOUND",
          }),
        );

        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should handle case-sensitive route names", async () => {
      try {
        await router.navigate("Users");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }
    });

    it("should handle route name with special characters", async () => {
      const errors: any[] = [];

      try {
        await router.navigate("route-with-dashes");
      } catch (error: any) {
        errors.push(error);
      }

      try {
        await router.navigate("route_with_underscores");
      } catch (error: any) {
        errors.push(error);
      }

      try {
        await router.navigate("route@with#symbols");
      } catch (error: any) {
        errors.push(error);
      }

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

      try {
        await router.navigate("invalid.route");
      } catch {
        // Expected
      }

      expect(onError).toHaveBeenCalledTimes(1);

      unsubError();
    });

    it("should work correctly after trying invalid route", async () => {
      try {
        await router.navigate("invalid.route");

        expect.fail("Should have thrown ROUTE_NOT_FOUND");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      }

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });
  });
});
