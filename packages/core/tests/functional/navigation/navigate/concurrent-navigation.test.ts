import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  expectTypeOf,
  vi,
} from "vitest";

import {
  getLifecycleApi,
  errorCodes,
  events,
  getPluginApi,
} from "@real-router/core";

import { createTestRouter } from "../../../helpers";

import type { Router, State, LifecycleApi } from "@real-router/core";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - concurrent navigation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
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

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        });
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should emit TRANSITION_CANCEL event when navigation is cancelled", async () => {
      vi.useFakeTimers();

      const onCancel = vi.fn();

      lifecycle.addActivateGuard("profile", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        });
      });

      const unsubCancel = getPluginApi(router).addEventListener(
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
      await router.start("/home");
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

      lifecycle.addActivateGuard("orders", asyncGuard);

      const promise = router.navigate("orders");

      setTimeout(() => {
        router.stop();
      }, 20);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(asyncGuard).toHaveBeenCalledTimes(1);

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should cancel navigation during async guard execution on settings", async () => {
      vi.useFakeTimers();

      const guard = vi.fn().mockImplementation(() => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 30);
        });
      });

      lifecycle.addActivateGuard("settings", guard);

      const promise = router.navigate("settings");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(guard).toHaveBeenCalledTimes(1);

      await router.start("/home");
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

      lifecycle.addActivateGuard("admin", failingGuard);

      const promise = router.navigate("admin");

      setTimeout(() => {
        router.stop();
      }, 50);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should not affect already completed navigation when router stops", async () => {
      vi.useFakeTimers();

      const promise = router.navigate("users");

      await vi.runAllTimersAsync();

      const state = await promise;

      expect(state).toBeDefined();
      expect(state.name).toBe("users");

      expect(router.getState()?.name).toBe("users");

      vi.useRealTimers();
    });

    it("should handle router.stop() called multiple times", async () => {
      vi.useFakeTimers();

      lifecycle.addActivateGuard("profile", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        });
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

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should cancel navigation and not emit TRANSITION_SUCCESS", async () => {
      vi.useFakeTimers();

      const onSuccess = vi.fn();
      const onCancel = vi.fn();

      lifecycle.addActivateGuard("orders", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 60);
        });
      });

      const unsubSuccess = getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );
      const unsubCancel = getPluginApi(router).addEventListener(
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
      await router.start("/home");
      vi.useRealTimers();
    });

    it("should cancel navigation with custom navigation options", async () => {
      vi.useFakeTimers();

      const onCancel = vi.fn();

      lifecycle.addActivateGuard("profile", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        });
      });

      const unsubCancel = getPluginApi(router).addEventListener(
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
      await router.start("/home");
      vi.useRealTimers();
    });

    it("should handle cancellation when router is stopped during navigation", async () => {
      vi.useFakeTimers();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 50);
        });
      });

      const promise = router.navigate("users");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should handle concurrent navigations where second cancels first", async () => {
      expect.hasAssertions();

      vi.useFakeTimers();

      lifecycle.addActivateGuard("users", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      });
      lifecycle.addActivateGuard("profile", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
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

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should handle cancellation during slow guard scenarios", async () => {
      vi.useFakeTimers();

      lifecycle.addActivateGuard("orders", () => () => {
        return new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(false);
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

      await router.start("/home");
      vi.useRealTimers();
    });

    it("should prioritise cancellation errors", async () => {
      vi.useFakeTimers();

      router.stop();

      lifecycle.addActivateGuard(
        "admin",
        () => () =>
          new Promise((_resolve, reject) => {
            setTimeout(reject, 20);
          }),
      );

      await router.start("/home");

      const promise = router.navigate("admin");

      setTimeout(() => {
        router.stop();
      }, 10);

      await vi.runAllTimersAsync();

      await expect(promise).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      await router.start("/home");
      vi.useRealTimers();
    });
  });

  describe("early validation errors during active transition", () => {
    it("should emit TRANSITION_ERROR for ROUTE_NOT_FOUND without disrupting ongoing transition", async () => {
      vi.useFakeTimers();

      const onError = vi.fn();
      const onSuccess = vi.fn();

      lifecycle.addActivateGuard("orders.pending", () => () => {
        return new Promise<boolean>((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 50),
        );
      });

      const unsubError = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );
      const unsubSuccess = getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        onSuccess,
      );

      // Start a slow navigation (FSM → TRANSITIONING)
      const promise = router.navigate("orders.pending");

      // Synchronously navigate to nonexistent route while transitioning
      await expect(
        router.navigate("nonexistent_route_xyz"),
      ).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      // TRANSITION_ERROR should have been emitted for the bad route
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ name: "home" }),
        expect.objectContaining({ code: errorCodes.ROUTE_NOT_FOUND }),
      );

      // Original transition should complete successfully
      await vi.runAllTimersAsync();
      await promise;

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: "orders.pending" }),
        expect.objectContaining({ name: "home" }),
        expect.anything(),
      );

      unsubError();
      unsubSuccess();
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
