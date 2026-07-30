import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - route not found", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation to non-existent route", () => {
    it("should call callback with ROUTE_NOT_FOUND error", async () => {
      await expect(router.navigate("nonexistent.route")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should emit TRANSITION_ERROR event with ROUTE_NOT_FOUND error", async () => {
      const onError = vi.fn();

      const unsubError = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await expect(router.navigate("invalid.route.name")).rejects.toMatchObject(
        {
          code: errorCodes.ROUTE_NOT_FOUND,
        },
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        undefined,
        // fromState is the committed start route — assert it, not `any(Object)`,
        // so a regression passing the wrong fromState is caught.
        expect.objectContaining({ name: "home" }),
        expect.objectContaining({
          code: errorCodes.ROUTE_NOT_FOUND,
        }),
      );

      unsubError();
    });

    it("should return noop function", async () => {
      await expect(router.navigate("nonexistent")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should handle route with invalid namespace", async () => {
      await expect(
        router.navigate("invalid.namespace.route"),
      ).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should handle route with parameters when route not found", async () => {
      await expect(
        router.navigate("nonexistent.route", { id: 123, name: "test" }),
      ).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should handle route with options when route not found", async () => {
      const options = { replace: true, force: true };

      await expect(
        router.navigate("invalid.route", {}, undefined, options),
      ).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should emit TRANSITION_ERROR with current state as fromState", async () => {
      const onError = vi.fn();

      const unsubError = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await router.navigate("users", {}, undefined, {});

      onError.mockClear();

      await expect(router.navigate("invalid.route")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

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

      const unsubStart = getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        onStart,
      );
      const unsubError = getPluginApi(router).addEventListener(
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

      const unsubSuccess = getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubError = getPluginApi(router).addEventListener(
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

      lifecycle.addActivateGuard("users", () => guard);
      router.usePlugin(() => ({
        onTransitionSuccess: () => {
          middleware();
        },
      }));

      try {
        await router.navigate("invalid.route");
      } catch {
        // Expected
      }

      expect(guard).not.toHaveBeenCalled();
      expect(middleware).not.toHaveBeenCalled();
    });

    it("should handle multiple invalid route navigations", async () => {
      const onError = vi.fn();

      const unsubError = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      await expect(router.navigate("invalid.route1")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      await expect(router.navigate("invalid.route2")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      expect(onError).toHaveBeenCalledTimes(2);

      unsubError();
    });

    it("should handle empty route name", async () => {
      await expect(router.navigate("")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
    });

    it("should return ROUTE_NOT_FOUND error with correct properties", async () => {
      await expect(router.navigate("invalid.route")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
        message: "ROUTE_NOT_FOUND",
      });
    });

    it("should handle case-sensitive route names", async () => {
      await expect(router.navigate("Users")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });
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
      const unsubError = getPluginApi(router).addEventListener(
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
      await expect(router.navigate("invalid.route")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      const state = await router.navigate("users");

      expect(state).toBeDefined();
      expect(state.name).toBe("users");
    });
  });
});
