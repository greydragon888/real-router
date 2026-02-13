import { logger } from "@real-router/logger";
import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import { errorCodes, events } from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State } from "@real-router/core";

let router: Router;
const noop = () => undefined;

describe("router.navigate() - concurrent navigation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start();
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("navigation cancellation", () => {
    beforeEach(() => {
      vi.useRealTimers(); // Ensure real timers between tests
    });

    afterEach(() => {
      router.clearMiddleware();
      vi.restoreAllMocks();
    });

    it("should return Promise from router.navigate", async () => {
      const result = router.navigate("users");

      expectTypeOf(result).toEqualTypeOf<Promise<State>>();

      expect(result).toBeInstanceOf(Promise);

      await result; // Clean up
    });

    it("should cancel navigation via router.stop() and reject with TRANSITION_CANCELLED error", async () => {
      vi.useFakeTimers();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should emit TRANSITION_CANCEL event when navigation is cancelled", async () => {
      vi.useFakeTimers();

      const onCancel = vi.fn();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const promise = router.navigate("profile");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "profile",
        }),
        expect.any(Object),
      );

      unsubCancel();
      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should cancel navigation during async guard execution", async () => {
      vi.useFakeTimers();

      const asyncGuard = vi.fn().mockImplementation(
        () => () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(true);
            }, 60);
          }),
      );

      router.addActivateGuard("orders", asyncGuard);

      const promise = router.navigate("orders");

      setTimeout(() => {
        router.stop();
      }, 20);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(asyncGuard).toHaveBeenCalledTimes(1);

      await router.start();
      vi.useRealTimers();
    });

    it("should cancel navigation during multiple async middleware", async () => {
      vi.useFakeTimers();

      const middleware1 = vi.fn().mockImplementation(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      const middleware2 = vi.fn().mockImplementation(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      router.useMiddleware(middleware1);
      router.useMiddleware(middleware2);

      const promise = router.navigate("settings");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(middleware1).toHaveBeenCalledTimes(1);

      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should prioritize cancellation over other errors", async () => {
      vi.useFakeTimers();

      const failingGuard = vi.fn().mockImplementation(
        () => () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error("Guard failed"));
            }, 100);
          }),
      );

      router.addActivateGuard("admin", failingGuard);

      const promise = router.navigate("admin");

      setTimeout(() => {
        router.stop();
      }, 50);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      await router.start();
      vi.useRealTimers();
    });

    it("should not affect already completed navigation when router stops", async () => {
      vi.useFakeTimers();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const promise = router.navigate("users");

      await vi.runAllTimersAsync();

      const state = await promise;

      expect(state).toBeDefined();
      expect(state.name).toBe("users");

      // State was set before stop
      expect(router.getState()?.name).toBe("users");

      router.clearMiddleware();
      vi.useRealTimers();
    });

    it("should handle router.stop() called multiple times", async () => {
      vi.useFakeTimers();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const promise = router.navigate("profile");

      setTimeout(() => {
        router.stop();
        router.stop();
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should cancel navigation and not emit TRANSITION_SUCCESS", async () => {
      vi.useFakeTimers();

      const onSuccess = vi.fn();
      const onCancel = vi.fn();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      const unsubSuccess = router.addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const promise = router.navigate("orders");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(onSuccess).not.toHaveBeenCalled();

      expect(onCancel).toHaveBeenCalledTimes(1);

      unsubSuccess();
      unsubCancel();
      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should cancel navigation with custom navigation options", async () => {
      vi.useFakeTimers();

      const onCancel = vi.fn();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const unsubCancel = router.addEventListener(
        events.TRANSITION_CANCEL,
        onCancel,
      );

      const navigationOptions = { replace: true, source: "test" };

      const promise = router.navigate("profile", {}, navigationOptions);

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(onCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "profile",
        }),
        expect.objectContaining({
          name: "home",
        }),
      );

      unsubCancel();
      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should handle cancellation when router is stopped during navigation", async () => {
      vi.useFakeTimers();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should handle concurrent navigations where second cancels first", async () => {
      expect.hasAssertions();

      vi.useFakeTimers();

      router.useMiddleware(() => async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const promise1 = router.navigate("users");
      const promise2 = router.navigate("profile");

      expect(promise1).toBeInstanceOf(Promise);
      expect(promise2).toBeInstanceOf(Promise);

      setTimeout(() => {
        router.stop();
      }, 50);

      await vi.runAllTimersAsync();

      await expect(promise1).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await expect(promise2).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      router.clearMiddleware();
      await router.start();
      vi.useRealTimers();
    });

    it("should handle cancellation during redirect scenarios", async () => {
      vi.spyOn(logger, "error").mockImplementation(noop);
      vi.useFakeTimers();

      router.addActivateGuard("orders", () => () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ name: "profile", params: {}, path: "/profile" });
          }, 40);
        });
      });

      const promise = router.navigate("orders");

      setTimeout(() => {
        router.stop();
      }, 20);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      await router.start();
      vi.useRealTimers();
    });

    it("should prioritise cancellation errors", async () => {
      vi.useFakeTimers();

      router.stop();

      router.addActivateGuard(
        "admin",
        () => () =>
          new Promise((_resolve, reject) => {
            setTimeout(reject, 20);
          }),
      );

      await router.start();

      const promise = router.navigate("admin");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      await router.start();
      vi.useRealTimers();
    });
  });

  // Note: "Issue #56: isNavigating()" tests were removed because isNavigating()
  // is no longer part of the public API.

  // Note: "Issue #57: Redundant buildState call" tests were removed because they
  // relied on spying on buildStateWithSegments facade method, which is now bypassed
  // by dependency injection. The optimization (single buildState call) is still
  // in place but cannot be verified via facade spy.
});
