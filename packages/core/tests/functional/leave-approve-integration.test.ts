import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, errorCodes } from "@real-router/core";
import {
  cloneRouter,
  getLifecycleApi,
  getPluginApi,
} from "@real-router/core/api";

import { getInternals } from "../../src/internals";
import { createTestRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("LEAVE_APPROVE pipeline — cross-component integration", () => {
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

  describe("RFC §9.4 — pipeline ordering", () => {
    it("full pipeline order: START → deactivate → LEAVE_APPROVE → activate → SUCCESS (invocationCallOrder)", async () => {
      const onTransitionStart = vi.fn();
      const deactivationGuard = vi.fn().mockReturnValue(true);
      const onLeaveApprove = vi.fn();
      const activationGuard = vi.fn().mockReturnValue(true);
      const onTransitionSuccess = vi.fn();

      getPluginApi(router).addEventListener(
        events.TRANSITION_START,
        onTransitionStart,
      );
      getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        onLeaveApprove,
      );

      lifecycle.addDeactivateGuard("home", () => deactivationGuard);
      lifecycle.addActivateGuard("users", () => activationGuard);

      router.usePlugin(() => ({ onTransitionSuccess }));

      await router.navigate("users");

      const startOrder = onTransitionStart.mock.invocationCallOrder[0];
      const deactivateOrder = deactivationGuard.mock.invocationCallOrder[0];
      const leaveApproveOrder = onLeaveApprove.mock.invocationCallOrder[0];
      const activateOrder = activationGuard.mock.invocationCallOrder[0];
      const successOrder = onTransitionSuccess.mock.invocationCallOrder[0];

      expect(startOrder).toBeLessThan(deactivateOrder);
      expect(deactivateOrder).toBeLessThan(leaveApproveOrder);
      expect(leaveApproveOrder).toBeLessThan(activateOrder);
      expect(activateOrder).toBeLessThan(successOrder);
    });

    it("FSM state: TRANSITION_STARTED → LEAVE_APPROVED → READY across navigation lifecycle", async () => {
      const observed = {
        onStart: { isTransitioning: false, isLeaveApproved: false },
        onLeaveApprove: { isTransitioning: false, isLeaveApproved: false },
        onSuccess: { isTransitioning: false, isLeaveApproved: false },
      };

      lifecycle.addDeactivateGuard("home", () => () => true);
      lifecycle.addActivateGuard("users", () => () => true);

      getPluginApi(router).addEventListener(events.TRANSITION_START, () => {
        observed.onStart.isTransitioning =
          getInternals(router).isTransitioning();
        observed.onStart.isLeaveApproved = router.isLeaveApproved();
      });

      getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          observed.onLeaveApprove.isTransitioning =
            getInternals(router).isTransitioning();
          observed.onLeaveApprove.isLeaveApproved = router.isLeaveApproved();
        },
      );

      router.usePlugin(() => ({
        onTransitionSuccess: () => {
          observed.onSuccess.isTransitioning =
            getInternals(router).isTransitioning();
          observed.onSuccess.isLeaveApproved = router.isLeaveApproved();
        },
      }));

      await router.navigate("users");

      expect(observed.onStart.isTransitioning).toBe(true);
      expect(observed.onStart.isLeaveApproved).toBe(false);

      expect(observed.onLeaveApprove.isTransitioning).toBe(true);
      expect(observed.onLeaveApprove.isLeaveApproved).toBe(true);

      expect(observed.onSuccess.isTransitioning).toBe(false);
      expect(observed.onSuccess.isLeaveApproved).toBe(false);
    });

    it("usePlugin() onTransitionLeaveApprove hook called with (toState, fromState)", async () => {
      const onLeaveApprove = vi.fn();

      router.usePlugin(() => ({ onTransitionLeaveApprove: onLeaveApprove }));

      await router.navigate("users");

      expect(onLeaveApprove).toHaveBeenCalledTimes(1);
      expect(onLeaveApprove).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        expect.objectContaining({ name: "home" }),
      );
    });

    it("subscribeLeave fires before subscribe: correct payload shapes and invocationCallOrder", async () => {
      const leaveListener = vi.fn();
      const successListener = vi.fn();

      const unsubLeave = router.subscribeLeave(leaveListener);
      const unsubSuccess = router.subscribe(successListener);

      await router.navigate("users");

      expect(leaveListener).toHaveBeenCalledTimes(1);
      expect(successListener).toHaveBeenCalledTimes(1);

      expect(leaveListener.mock.invocationCallOrder[0]).toBeLessThan(
        successListener.mock.invocationCallOrder[0],
      );

      expect(leaveListener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ name: "home" }),
          nextRoute: expect.objectContaining({ name: "users" }),
        }),
      );

      const leaveState = leaveListener.mock.calls[0][0];

      expect(leaveState.signal).toBeInstanceOf(AbortSignal);

      expect(successListener).toHaveBeenCalledWith({
        route: expect.objectContaining({ name: "users" }),
        previousRoute: expect.objectContaining({ name: "home" }),
      });

      unsubLeave();
      unsubSuccess();
    });

    it("blocked deactivation: CANNOT_DEACTIVATE → no LEAVE_APPROVE, subscribeLeave NOT called, FSM → READY", async () => {
      const leaveListener = vi.fn();

      lifecycle.addDeactivateGuard("home", () => () => false);

      const unsubLeave = router.subscribeLeave(leaveListener);

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });

      expect(leaveListener).not.toHaveBeenCalled();
      expect(router.isLeaveApproved()).toBe(false);
      expect(router.isActive()).toBe(true);

      unsubLeave();
    });

    it("zero-guard path: subscribeLeave fires via direct emitLeaveApproveCallback, router.subscribe receives result", async () => {
      const leaveListener = vi.fn();
      const successListener = vi.fn();

      const unsubLeave = router.subscribeLeave(leaveListener);
      const unsubSuccess = router.subscribe(successListener);

      const finalState = await router.navigate("users");

      expect(leaveListener).toHaveBeenCalledTimes(1);
      expect(leaveListener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ name: "home" }),
          nextRoute: expect.objectContaining({ name: "users" }),
        }),
      );

      expect(successListener).toHaveBeenCalledTimes(1);
      expect(finalState.name).toBe("users");

      unsubLeave();
      unsubSuccess();
    });

    it("reentrant navigate from subscribeLeave() on no-guards path: original cancelled, reentrant nav succeeds", async () => {
      let reentrantNavPromise: Promise<unknown> | undefined;
      let fired = false;

      const unsubLeave = router.subscribeLeave(({ nextRoute }) => {
        if (nextRoute.name === "users" && !fired) {
          fired = true;
          reentrantNavPromise = router.navigate("orders");
        }
      });

      const originalNav = router.navigate("users");

      await expect(originalNav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await reentrantNavPromise;

      expect(router.getState()?.name).toBe("orders");

      unsubLeave();
    });
  });

  describe("RFC §8.6 — edge cases", () => {
    it("error thrown in subscribeLeave listener propagates to pipeline: TRANSITION_ERROR, navigation cancelled", async () => {
      const onError = vi.fn();
      const successListener = vi.fn();

      const unsubLeave = router.subscribeLeave(() => {
        throw new Error("subscribeLeave threw");
      });

      const unsubError = getPluginApi(router).addEventListener(
        events.TRANSITION_ERROR,
        onError,
      );

      const unsubSuccess = router.subscribe(successListener);

      await expect(router.navigate("users")).rejects.toThrow(
        "subscribeLeave threw",
      );

      expect(successListener).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(router.isActive()).toBe(true);
      expect(router.getState()?.name).toBe("home");

      unsubLeave();
      unsubError();
      unsubSuccess();
    });

    it("dispose() during LEAVE_APPROVED: navigation cancelled, router disposed", async () => {
      vi.useFakeTimers();

      lifecycle.addDeactivateGuard("home", () => () => true);
      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 100),
          ),
      );

      let leaveApproveReached = false;
      const unsubLeaveApprove = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          leaveApproveReached = true;
        },
      );

      const navPromise = router.navigate("users");

      expect(leaveApproveReached).toBe(true);
      expect(router.isLeaveApproved()).toBe(true);

      router.dispose();

      await vi.runAllTimersAsync();

      await expect(navPromise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(router.isActive()).toBe(false);

      unsubLeaveApprove();
      vi.useRealTimers();
    });

    it("stop() during LEAVE_APPROVED: navigation cancelled, router stopped", async () => {
      vi.useFakeTimers();

      lifecycle.addDeactivateGuard("home", () => () => true);
      lifecycle.addActivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 100),
          ),
      );

      let leaveApproveReached = false;
      const unsubLeaveApprove = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          leaveApproveReached = true;
        },
      );

      const navPromise = router.navigate("users");

      expect(leaveApproveReached).toBe(true);
      expect(router.isLeaveApproved()).toBe(true);

      router.stop();

      await vi.runAllTimersAsync();

      await expect(navPromise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(router.isActive()).toBe(false);

      unsubLeaveApprove();
      vi.useRealTimers();
    });

    it("navigateToNotFound() bypasses pipeline: subscribeLeave NOT called", () => {
      const leaveListener = vi.fn();

      const unsubLeave = router.subscribeLeave(leaveListener);

      router.navigateToNotFound("/unknown-path");

      expect(leaveListener).not.toHaveBeenCalled();

      unsubLeave();
    });

    it("cloneRouter() does not copy subscribeLeave listeners from original", async () => {
      const leaveListener = vi.fn();

      const unsubLeave = router.subscribeLeave(leaveListener);

      const clone = cloneRouter(router);

      await clone.start("/home");

      await clone.navigate("users");

      expect(leaveListener).not.toHaveBeenCalled();

      clone.stop();
      unsubLeave();
    });

    it("forceDeactivate: true skips deactivation guard but LEAVE_APPROVE still fires via subscribeLeave", async () => {
      const deactivateGuard = vi.fn().mockReturnValue(false);
      const leaveListener = vi.fn();

      lifecycle.addDeactivateGuard("home", () => deactivateGuard);

      const unsubLeave = router.subscribeLeave(leaveListener);

      await router.navigate("users", {}, { forceDeactivate: true });

      expect(deactivateGuard).not.toHaveBeenCalled();
      expect(leaveListener).toHaveBeenCalledTimes(1);
      expect(leaveListener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ name: "home" }),
          nextRoute: expect.objectContaining({ name: "users" }),
        }),
      );

      unsubLeave();
    });

    it("activation guard blocks after LEAVE_APPROVE: subscribeLeave WAS called, route unchanged", async () => {
      const leaveListener = vi.fn();

      const unsubLeave = router.subscribeLeave(leaveListener);

      lifecycle.addActivateGuard("users", () => () => false);

      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
      });

      expect(leaveListener).toHaveBeenCalledTimes(1);
      expect(router.getState()?.name).toBe("home");

      unsubLeave();
    });

    it("async concurrent cancel: first nav cancelled before LEAVE_APPROVE, only second nav fires subscribeLeave", async () => {
      vi.useFakeTimers();

      const leaveListener = vi.fn();

      const unsubLeave = router.subscribeLeave(leaveListener);

      lifecycle.addDeactivateGuard(
        "home",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 100),
          ),
      );

      const firstNav = router.navigate("users");
      const secondNav = router.navigate("orders");

      await vi.runAllTimersAsync();

      await expect(firstNav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      const secondResult = await secondNav;

      expect(secondResult.name).toBe("orders");

      expect(leaveListener).toHaveBeenCalledTimes(1);
      expect(leaveListener).toHaveBeenCalledWith(
        expect.objectContaining({
          route: expect.objectContaining({ name: "home" }),
          nextRoute: expect.objectContaining({ name: "orders" }),
        }),
      );

      unsubLeave();
      vi.useRealTimers();
    });
  });
});
