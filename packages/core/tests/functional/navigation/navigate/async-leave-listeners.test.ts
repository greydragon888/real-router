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
      // The second navigation SUCCEEDED — its leave signal must stay unaborted
      // (the signal aborts only on cancellation, never on success — #722).
      expect(signals[1].aborted).toBe(false);

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
      // The second navigation SUCCEEDED — its leave signal must stay unaborted
      // (the signal aborts only on cancellation, never on success — #722).
      expect(signals[1].aborted).toBe(false);

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

    it("non-Error async rejection is wrapped via ensureError", async () => {
      // The settle path wraps `rejected.reason` with ensureError. A non-Error
      // rejection (a bare string) exercises the `new Error(String(value))` arm —
      // the navigation still rejects with a real Error carrying the stringified
      // reason instead of leaking the raw string.
      router.subscribeLeave(async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- intentional non-Error to exercise ensureError's wrapping arm
        throw "boom";
      });

      const error = await router.navigate("users").then(
        () => undefined,
        (error_: unknown) => error_,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("boom");
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

    it("sync reentrant leave navigation is depth-bounded (maxEventDepth), not unbounded (#935)", async () => {
      // A sync subscribeLeave listener that navigates re-enters the leave
      // dispatch on the SAME C-stack. Unbounded it overflows (~615 deep) with a
      // RangeError that leaks / wedges the worker. The dispatch must be bounded
      // like the plugin onTransitionLeaveApprove path (emitter maxEventDepth),
      // raising a controlled RecursionDepthError well before the stack overflows.
      const errors: unknown[] = [];

      getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        (_toState, _fromState, err) => {
          errors.push(err);
        },
      );

      let calls = 0;
      // Safety cap FAR below the ~615 overflow ceiling so that, WITHOUT the fix,
      // this fails by assertion (calls reaches the cap) rather than wedging.
      const SAFETY_CAP = 50;

      router.subscribeLeave(() => {
        calls++;

        if (calls < SAFETY_CAP) {
          // Alternate users/orders — never the current ("home") route, so no
          // SAME_STATES short-circuit breaks the reentrant chain.
          void router.navigate(calls % 2 === 0 ? "users" : "orders");
        }
      });

      await router.navigate("users").catch(() => undefined);
      await Promise.resolve();

      // Bounded by maxEventDepth (default 5) — the listener fires only a handful
      // of times, NOT the full SAFETY_CAP.
      expect(calls).toBeLessThan(SAFETY_CAP);
      expect(calls).toBeLessThanOrEqual(6);

      // The bound surfaces as a controlled RecursionDepthError (name stable
      // across bundle boundaries), not a RangeError stack overflow.
      expect(
        errors.some(
          (err) => (err as { name?: string }).name === "RecursionDepthError",
        ),
      ).toBe(true);
    });

    it("maxEventDepth = 0 opts out of the reentrancy bound (mirrors the emitter) (#935)", async () => {
      const local = createTestRouter({ limits: { maxEventDepth: 0 } });

      await local.start("/home");

      const errors: unknown[] = [];

      getPluginApi(local).addEventListener(
        events.TRANSITION_ERROR,
        (_toState, _fromState, err) => {
          errors.push(err);
        },
      );

      let calls = 0;
      // Bounded by the listener itself, well below the C-stack ceiling — with
      // depth protection disabled the dispatch must NOT raise RecursionDepthError.
      const CAP = 20;

      local.subscribeLeave(() => {
        calls++;

        if (calls < CAP) {
          void local.navigate(calls % 2 === 0 ? "users" : "orders");
        }
      });

      await local.navigate("users").catch(() => undefined);
      await Promise.resolve();

      expect(calls).toBe(CAP);
      expect(
        errors.some(
          (err) => (err as { name?: string }).name === "RecursionDepthError",
        ),
      ).toBe(false);

      local.stop();
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

  describe("payload + return-value contract", () => {
    it("leave payload wrapper is frozen — listeners cannot mutate or extend it", async () => {
      let payload: object | undefined;

      router.subscribeLeave((p) => {
        payload = p;
      });

      await router.navigate("users");

      expect(Object.isFrozen(payload)).toBe(true);
      expect(() => Object.assign(payload!, { extra: "x" })).toThrow(TypeError);
    });

    it("a thenable return value is awaited like a Promise (blocks until it resolves)", async () => {
      const order: string[] = [];
      let thenCalled = false;

      // A plain object with a `then` method is NOT a Promise, but the pipeline
      // treats any `typeof result.then === "function"` as awaitable. Cast past
      // the `void | Promise<void>` return type to exercise that branch.
      router.subscribeLeave(
        () =>
          ({
            // eslint-disable-next-line unicorn/no-thenable -- intentional: exercising the thenable-as-Promise branch in awaitLeaveListeners
            then(onFulfilled: () => void) {
              thenCalled = true;
              order.push("leave-then");
              onFulfilled();
            },
          }) as unknown as Promise<void>,
      );

      router.subscribe(() => order.push("subscribe"));

      await router.navigate("users");

      expect(thenCalled).toBe(true);
      // subscribe fires only after the thenable settled → it was awaited
      expect(order).toStrictEqual(["leave-then", "subscribe"]);
      expect(router.getState()?.name).toBe("users");
    });

    it("duplicate subscribeLeave(fn): both entries fire; unsubscribe removes exactly one", async () => {
      const spy = vi.fn();

      const unsubA = router.subscribeLeave(spy);
      const unsubB = router.subscribeLeave(spy);

      await router.navigate("users");

      expect(spy).toHaveBeenCalledTimes(2); // both array entries fire

      unsubB();

      await router.navigate("orders");

      expect(spy).toHaveBeenCalledTimes(3); // exactly one entry survived

      unsubA();
    });
  });
});
