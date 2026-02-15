import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router.navigate() - router not started", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation when router is not started", () => {
    beforeEach(() => {
      router.stop();
    });

    afterEach(async () => {
      await router.start("/home").catch(() => {});
    });

    it("should call callback with ROUTER_NOT_STARTED error", async () => {
      try {
        await router.navigate("users");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should return noop function when router is not started", async () => {
      try {
        await router.navigate("users");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should not continue navigation process", async () => {
      const onStart = vi.fn();
      const onSuccess = vi.fn();
      const onError = vi.fn();

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

      try {
        await router.navigate("users");
      } catch {
        // Expected
      }

      expect(onStart).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      unsubStart();
      unsubSuccess();
      unsubError();
    });

    it("should handle navigation with parameters when router not started", async () => {
      try {
        await router.navigate("users.view", { id: 123 });

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should handle navigation with options when router not started", async () => {
      const options = { replace: true, source: "test" };

      try {
        await router.navigate("profile", {}, options);

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should handle multiple navigate calls when router not started", async () => {
      const errors: any[] = [];

      try {
        await router.navigate("users");
      } catch (error: any) {
        errors.push(error);
      }

      try {
        await router.navigate("profile");
      } catch (error: any) {
        errors.push(error);
      }

      try {
        await router.navigate("orders");
      } catch (error: any) {
        errors.push(error);
      }

      expect(errors).toHaveLength(3);
      expect(errors[0]).toBeDefined();
      expect(errors[0].code).toBe(errorCodes.ROUTER_NOT_STARTED);
      expect(errors[1]).toBeDefined();
      expect(errors[1].code).toBe(errorCodes.ROUTER_NOT_STARTED);
      expect(errors[2]).toBeDefined();
      expect(errors[2].code).toBe(errorCodes.ROUTER_NOT_STARTED);
    });

    it("should not trigger guards or middleware when router not started", async () => {
      const guard = vi.fn().mockReturnValue(true);
      const middleware = vi.fn();

      router.addActivateGuard("users", () => guard);
      router.useMiddleware(() => middleware);

      try {
        await router.navigate("users");
      } catch {
        // Expected
      }

      expect(guard).not.toHaveBeenCalled();
      expect(middleware).not.toHaveBeenCalled();

      router.clearMiddleware();
    });

    it("should handle invalid route names when router not started", async () => {
      try {
        await router.navigate("nonexistent.route");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should return noop function that is safe to call", async () => {
      try {
        await router.navigate("users");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should work correctly after router is started", async () => {
      expect(router.isActive()).toBe(false);

      try {
        await router.navigate("users");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }

      await router.start("/home");

      expect(router.isActive()).toBe(true);

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });

    it("should emit no events when router is not started", async () => {
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

      try {
        await router.navigate("users");
      } catch {
        // Expected
      }

      expect(onTransitionStart).not.toHaveBeenCalled();
      expect(onTransitionCancel).not.toHaveBeenCalled();
      expect(onTransitionError).not.toHaveBeenCalled();
      expect(onTransitionSuccess).not.toHaveBeenCalled();

      unsubStart();
      unsubCancel();
      unsubError();
      unsubSuccess();
    });

    it("should handle navigation without callback when router not started", async () => {
      try {
        await router.navigate("users");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });

    it("should return ROUTER_NOT_STARTED error with correct properties", async () => {
      try {
        await router.navigate("users");

        expect.fail("Should have thrown ROUTER_NOT_STARTED");
      } catch (error: any) {
        expect(error).toStrictEqual(
          expect.objectContaining({
            code: errorCodes.ROUTER_NOT_STARTED,
            message: "NOT_STARTED",
          }),
        );

        expect(error.code).toBe(errorCodes.ROUTER_NOT_STARTED);
      }
    });
  });
});
