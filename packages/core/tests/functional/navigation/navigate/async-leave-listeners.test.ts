import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() — async subscribeLeave listeners", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }

    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("async listener blocks pipeline", () => {
    it("async leave listener blocks navigation until resolved (no guards)", async () => {
      const callOrder: string[] = [];

      router.subscribeLeave(async () => {
        callOrder.push("leave-start");
        await Promise.resolve();
        callOrder.push("leave-end");
      });

      router.subscribe(() => callOrder.push("subscribe"));

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "leave-start",
        "leave-end",
        "subscribe",
      ]);
      expect(router.getState()?.name).toBe("users");
    });

    it("async leave listener blocks activation guards (guards path)", async () => {
      const callOrder: string[] = [];

      lifecycle.addDeactivateGuard("home", () => () => {
        callOrder.push("deactivate");

        return true;
      });

      router.subscribeLeave(async () => {
        callOrder.push("leave-start");
        await Promise.resolve();
        callOrder.push("leave-end");
      });

      lifecycle.addActivateGuard("users", () => () => {
        callOrder.push("activate");

        return true;
      });

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "deactivate",
        "leave-start",
        "leave-end",
        "activate",
      ]);
    });

    it("async leave completes without activation guards (deactivation guard + async leave only)", async () => {
      const callOrder: string[] = [];

      lifecycle.addDeactivateGuard("home", () => () => {
        callOrder.push("deactivate");

        return true;
      });

      router.subscribeLeave(async () => {
        callOrder.push("leave-start");
        await Promise.resolve();
        callOrder.push("leave-end");
      });

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "deactivate",
        "leave-start",
        "leave-end",
      ]);
      expect(router.getState()?.name).toBe("users");
    });

    it("async leave listener blocks after async deactivation guards", async () => {
      const callOrder: string[] = [];

      lifecycle.addDeactivateGuard("home", () => async () => {
        callOrder.push("deactivate");

        return true;
      });

      router.subscribeLeave(async () => {
        callOrder.push("leave-start");
        await Promise.resolve();
        callOrder.push("leave-end");
      });

      lifecycle.addActivateGuard("users", () => () => {
        callOrder.push("activate");

        return true;
      });

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "deactivate",
        "leave-start",
        "leave-end",
        "activate",
      ]);
    });

    it("async leave followed by async activation guard", async () => {
      const callOrder: string[] = [];

      lifecycle.addDeactivateGuard("home", () => () => {
        callOrder.push("deactivate");

        return true;
      });

      router.subscribeLeave(async () => {
        callOrder.push("leave-start");
        await Promise.resolve();
        callOrder.push("leave-end");
      });

      lifecycle.addActivateGuard("users", () => async () => {
        callOrder.push("activate-start");
        await Promise.resolve();
        callOrder.push("activate-end");

        return true;
      });

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "deactivate",
        "leave-start",
        "leave-end",
        "activate-start",
        "activate-end",
      ]);
      expect(router.getState()?.name).toBe("users");
    });

    it("concurrent navigation cancels async activation guard after async leave", async () => {
      vi.useFakeTimers();

      lifecycle.addDeactivateGuard("home", () => () => true);

      router.subscribeLeave(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      lifecycle.addActivateGuard("users", () => async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));

        return true;
      });

      const firstNav = router.navigate("users");

      await vi.advanceTimersByTimeAsync(60);

      const secondNav = router.navigate("orders");

      await vi.advanceTimersByTimeAsync(200);

      await expect(firstNav).rejects.toThrow();

      await secondNav;

      expect(router.getState()?.name).toBe("orders");

      vi.useRealTimers();
    });
  });

  describe("signal", () => {
    it("signal passed to listener, signal.aborted === false initially", async () => {
      let receivedSignal: AbortSignal | undefined;

      router.subscribeLeave(({ signal }) => {
        receivedSignal = signal;
      });

      await router.navigate("users");

      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it("concurrent navigation aborts signal (no guards path)", async () => {
      vi.useFakeTimers();

      const signals: AbortSignal[] = [];

      router.subscribeLeave(async ({ signal }) => {
        signals.push(signal);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const firstNav = router.navigate("users");

      await vi.advanceTimersByTimeAsync(10);

      const secondNav = router.navigate("orders");

      expect(signals[0].aborted).toBe(true);

      await vi.runAllTimersAsync();

      await expect(firstNav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await secondNav;

      expect(router.getState()?.name).toBe("orders");
      expect(signals).toHaveLength(2);
      expect(signals[1].aborted).toBe(true);

      vi.useRealTimers();
    });

    it("concurrent navigation aborts signal (guards path)", async () => {
      vi.useFakeTimers();

      const signals: AbortSignal[] = [];

      lifecycle.addDeactivateGuard("home", () => () => true);

      router.subscribeLeave(async ({ signal }) => {
        signals.push(signal);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const firstNav = router.navigate("users");

      await vi.advanceTimersByTimeAsync(10);

      const secondNav = router.navigate("orders");

      expect(signals[0].aborted).toBe(true);

      await vi.runAllTimersAsync();

      await expect(firstNav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await secondNav;

      expect(router.getState()?.name).toBe("orders");
      expect(signals).toHaveLength(2);
      expect(signals[1].aborted).toBe(true);

      vi.useRealTimers();
    });
  });

  describe("error handling", () => {
    it("sync throw in leave listener → TRANSITION_ERROR (no guards)", async () => {
      const onError = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

      router.subscribeLeave(() => {
        throw new Error("sync leave error");
      });

      await expect(router.navigate("users")).rejects.toThrow(
        "sync leave error",
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("home");
    });

    it("async rejection → TRANSITION_ERROR (no guards)", async () => {
      const onError = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

      router.subscribeLeave(async () => {
        throw new Error("async leave error");
      });

      await expect(router.navigate("users")).rejects.toThrow(
        "async leave error",
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("home");
    });

    it("sync throw → other listeners still run", async () => {
      const calls: number[] = [];

      router.subscribeLeave(() => {
        calls.push(1);

        throw new Error("first");
      });

      router.subscribeLeave(() => {
        calls.push(2);
      });
      router.subscribeLeave(() => {
        calls.push(3);
      });

      await expect(router.navigate("users")).rejects.toThrow("first");

      expect(calls).toStrictEqual([1, 2, 3]);
    });

    it("mixed sync error + async error → sync error priority", async () => {
      router.subscribeLeave(() => {
        throw new Error("sync error");
      });

      router.subscribeLeave(async () => {
        throw new Error("async error");
      });

      await expect(router.navigate("users")).rejects.toThrow("sync error");
    });

    it("async rejection with guards path → TRANSITION_ERROR", async () => {
      const onError = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

      lifecycle.addDeactivateGuard("home", () => () => true);

      router.subscribeLeave(async () => {
        throw new Error("leave error in guards path");
      });

      await expect(router.navigate("users")).rejects.toThrow(
        "leave error in guards path",
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("home");
    });
  });

  describe("backward compatibility", () => {
    it("sync listeners still work unchanged", async () => {
      const listener = vi.fn();

      router.subscribeLeave(listener);

      await router.navigate("users");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ name: "home" }),
          nextRoute: expect.objectContaining({ name: "users" }),
        }),
      );
    });

    it("mixed sync + async listeners: all execute (sync before async settles)", async () => {
      const calls: number[] = [];

      router.subscribeLeave(() => {
        calls.push(1);
      });
      router.subscribeLeave(async () => {
        await Promise.resolve();
        calls.push(2);
      });
      router.subscribeLeave(() => {
        calls.push(3);
      });

      await router.navigate("users");

      expect(calls).toStrictEqual([1, 3, 2]);
      expect(router.getState()?.name).toBe("users");
    });
  });

  describe("dispose and cleanup", () => {
    it("dispose() clears leave listeners", async () => {
      const listener = vi.fn();

      router.subscribeLeave(listener);

      router.dispose();

      const newRouter = createTestRouter();

      await newRouter.start("/home");

      newRouter.subscribeLeave(listener);

      await newRouter.navigate("users");

      expect(listener).toHaveBeenCalledTimes(1);

      newRouter.stop();
    });
  });

  describe("reentrant navigation", () => {
    it("reentrant navigate from sync leave listener: original cancelled, reentrant succeeds (no guards)", async () => {
      let fired = false;
      let reentrantPromise: Promise<unknown> | undefined;

      router.subscribeLeave(({ nextRoute }) => {
        if (nextRoute.name === "users" && !fired) {
          fired = true;
          reentrantPromise = router.navigate("orders");
        }
      });

      const original = router.navigate("users");

      await expect(original).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await reentrantPromise;

      expect(router.getState()?.name).toBe("orders");
    });

    it("reentrant navigate from async leave listener: original cancelled", async () => {
      vi.useFakeTimers();

      let fired = false;
      let reentrantPromise: Promise<unknown> | undefined;

      router.subscribeLeave(async ({ nextRoute }) => {
        if (nextRoute.name === "users" && !fired) {
          fired = true;
          await new Promise((resolve) => setTimeout(resolve, 50));
          reentrantPromise = router.navigate("orders");
        }
      });

      const original = router.navigate("users");

      await vi.runAllTimersAsync();

      await expect(original).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await reentrantPromise;

      expect(router.getState()?.name).toBe("orders");

      vi.useRealTimers();
    });
  });

  describe("no-guards path optimization", () => {
    it("no leave listeners, no guards: sync hot path preserved", () => {
      void router.navigate("users");

      expect(router.getState()?.name).toBe("users");
    });

    it("sync leave listener on no-guards path: navigation completes synchronously", () => {
      const listener = vi.fn();

      router.subscribeLeave(listener);

      void router.navigate("users");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("users");
    });
  });
});
