import { describe, it, expect, vi, afterEach } from "vitest";

import { createRouter, errorCodes, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

// Contract (packages/core/CLAUDE.md): the `subscribeLeave` payload `signal`
// aborts ONLY when the navigation is cancelled (superseded by a newer
// navigate(), stop(), dispose(), or external-signal abort) — never on success —
// and consistently across both the guard and no-guards pipeline paths (#722).

const ROUTES: Route[] = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "orders", path: "/orders" },
];

// Guard-free router → navigation takes the no-guards leave branch
// (`#handleNoGuardsLeave`). `getFunctions()` exposes ALL registered guards, so
// even one guard anywhere forces the guard pipeline; a truly empty router is
// the only way to exercise the no-guards path.
function guardFreeRouter(): Router {
  return createRouter(ROUTES);
}

// One activation guard → `hasGuards` is true for every navigation, so the
// transition runs through `executeGuardPipeline` (the guard path).
function guardedRouter(): Router {
  const router = createRouter(ROUTES);

  getLifecycleApi(router).addActivateGuard("users", () => () => true);

  return router;
}

describe("subscribeLeave signal — cancellation contract (#722)", () => {
  let active: Router | undefined;

  afterEach(() => {
    if (active?.isActive()) {
      active.stop();
    }

    active = undefined;
    vi.useRealTimers();
  });

  describe("must NOT abort on successful navigation", () => {
    it("guard path, sync guard: signal stays unaborted after success", async () => {
      const router = (active = guardedRouter());

      await router.start("/");

      let signal: AbortSignal | undefined;

      router.subscribeLeave((payload) => {
        signal = payload.signal;
      });

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
      expect(signal?.aborted).toBe(false);
    });

    it("guard path, async guard: signal stays unaborted after success", async () => {
      const router = createRouter(ROUTES);

      active = router;
      getLifecycleApi(router).addActivateGuard("users", () => async () => true);
      await router.start("/");

      let signal: AbortSignal | undefined;

      router.subscribeLeave((payload) => {
        signal = payload.signal;
      });

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
      expect(signal?.aborted).toBe(false);
    });

    it("no-guards path, sync leave listener: signal stays unaborted after success", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      let signal: AbortSignal | undefined;

      router.subscribeLeave((payload) => {
        signal = payload.signal;
      });

      await router.navigate("users");

      expect(signal?.aborted).toBe(false);
    });

    it("no-guards path, async leave listener: signal stays unaborted after success", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      let signal: AbortSignal | undefined;

      router.subscribeLeave(async (payload) => {
        signal = payload.signal;
        await Promise.resolve();
      });

      const state = await router.navigate("users");

      expect(state.name).toBe("users");
      expect(signal?.aborted).toBe(false);
    });
  });

  describe("MUST abort when the navigation is cancelled", () => {
    // A superseding navigation re-fires the leave listener for its own
    // transition, so the captured signal would be overwritten — collect every
    // leave signal and assert on the FIRST (the cancelled navigation's).
    it("guard path: a superseding navigate aborts the in-flight leave signal", async () => {
      vi.useFakeTimers();

      const router = (active = guardedRouter());

      await router.start("/");

      const signals: AbortSignal[] = [];

      router.subscribeLeave(async (payload) => {
        signals.push(payload.signal);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const first = router.navigate("users");

      await vi.advanceTimersByTimeAsync(10);

      const second = router.navigate("orders");

      expect(signals[0]?.aborted).toBe(true);

      await vi.runAllTimersAsync();

      await expect(first).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await second;
    });

    it("no-guards path: a superseding navigate aborts the in-flight leave signal", async () => {
      vi.useFakeTimers();

      const router = (active = guardFreeRouter());

      await router.start("/");

      const signals: AbortSignal[] = [];

      router.subscribeLeave(async (payload) => {
        signals.push(payload.signal);
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      const first = router.navigate("users");

      await vi.advanceTimersByTimeAsync(10);

      const second = router.navigate("orders");

      expect(signals[0]?.aborted).toBe(true);

      await vi.runAllTimersAsync();

      await expect(first).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await second;
    });

    it("no-guards path: a reentrant navigate from a sync leave listener aborts its signal", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      const signals: AbortSignal[] = [];
      let reentered = false;

      router.subscribeLeave((payload) => {
        signals.push(payload.signal);

        if (payload.nextRoute.name === "users" && !reentered) {
          reentered = true;
          void router.navigate("orders");
        }
      });

      await router.navigate("users").catch(() => undefined);

      expect(signals[0]?.aborted).toBe(true);
    });
  });

  describe("no-guards leave path — error and cancellation coverage", () => {
    it("sync leave listener throw rejects with the error and aborts the signal", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      const onError = vi.fn();

      getPluginApi(router).addEventListener(events.TRANSITION_ERROR, onError);

      let signal: AbortSignal | undefined;

      router.subscribeLeave((payload) => {
        signal = payload.signal;

        throw new Error("leave boom");
      });

      await expect(router.navigate("users")).rejects.toThrow("leave boom");

      expect(onError).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
      expect(router.getState()?.name).toBe("home");
    });

    it("plugin navigating during LEAVE_APPROVE cancels a listener-less navigation", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      let reentered = false;

      getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        (toState) => {
          if (toState?.name === "users" && !reentered) {
            reentered = true;
            void router.navigate("orders");
          }
        },
      );

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(router.getState()?.name).toBe("orders");
    });

    it("no leave listeners, no guards: navigation completes on the sync hot path", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");
    });
  });

  // #943: on the FAILURE path the leave signal must abort with a reason that
  // carries router/error context — consistent with the cancellation path, which
  // aborts with RouterError(TRANSITION_CANCELLED). Before the fix the failure
  // path called `controller.abort()` with no argument, so `signal.reason` was a
  // generic DOMException [AbortError] with no router context.
  describe("MUST carry a meaningful reason on the failure path (#943)", () => {
    it("no-guards path: sync leave throw aborts the signal with the thrown error as reason", async () => {
      const router = (active = guardFreeRouter());

      await router.start("/");

      const boom = new Error("leave boom");
      let signal: AbortSignal | undefined;

      router.subscribeLeave((payload) => {
        signal = payload.signal;

        throw boom;
      });

      await expect(router.navigate("users")).rejects.toThrow("leave boom");

      expect(signal?.aborted).toBe(true);
      expect(signal?.reason).toBe(boom);
    });

    it("guard path: a rejecting activation guard aborts the signal with RouterError(CANNOT_ACTIVATE)", async () => {
      const router = (active = createRouter(ROUTES));

      getLifecycleApi(router).addActivateGuard("users", () => () => false);

      await router.start("/");

      let signal: AbortSignal | undefined;

      router.subscribeLeave((payload) => {
        signal = payload.signal;
      });

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      expect(signal?.aborted).toBe(true);
      expect((signal?.reason as { code?: string } | undefined)?.code).toBe(
        errorCodes.CANNOT_ACTIVATE,
      );
    });
  });
});
