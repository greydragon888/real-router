import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("resolveRemainingGuards branches", () => {
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
  });

  it("should pass sync guard after async guard in activate phase", async () => {
    const ordersAsyncGuard = vi.fn().mockResolvedValue(true);
    const pendingSyncGuard = vi.fn().mockReturnValue(true);

    lifecycle.addActivateGuard("orders", () => ordersAsyncGuard);
    lifecycle.addActivateGuard("orders.pending", () => pendingSyncGuard);

    const state = await router.navigate("orders.pending");

    expect(state.name).toBe("orders.pending");
    expect(ordersAsyncGuard).toHaveBeenCalledTimes(1);
    expect(pendingSyncGuard).toHaveBeenCalledTimes(1);
  });

  it("should block when sync guard returns false after async guard", async () => {
    const ordersAsyncGuard = vi.fn().mockResolvedValue(true);
    const pendingSyncGuard = vi.fn().mockReturnValue(false);

    lifecycle.addActivateGuard("orders", () => ordersAsyncGuard);
    lifecycle.addActivateGuard("orders.pending", () => pendingSyncGuard);

    await expect(router.navigate("orders.pending")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });

    expect(ordersAsyncGuard).toHaveBeenCalledTimes(1);
    expect(pendingSyncGuard).toHaveBeenCalledTimes(1);
  });

  it("should handle sync guard error after async guard", async () => {
    const ordersAsyncGuard = vi.fn().mockResolvedValue(true);
    const pendingSyncGuard = vi.fn().mockImplementation(() => {
      throw new Error("guard error");
    });

    lifecycle.addActivateGuard("orders", () => ordersAsyncGuard);
    lifecycle.addActivateGuard("orders.pending", () => pendingSyncGuard);

    await expect(router.navigate("orders.pending")).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });

    expect(ordersAsyncGuard).toHaveBeenCalledTimes(1);
    expect(pendingSyncGuard).toHaveBeenCalledTimes(1);
  });

  it("should cancel when navigation superseded during remaining guard iteration (sync path)", async () => {
    vi.useFakeTimers();

    try {
      await router.navigate("users");

      const usersDeactivateGuard = vi.fn().mockReturnValue(
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 10),
        ),
      );
      const ordersActivateGuard = vi.fn().mockImplementation(() => {
        void router.navigate("home");

        return true;
      });
      const pendingActivateGuard = vi.fn().mockReturnValue(true);

      lifecycle.addDeactivateGuard("users", () => usersDeactivateGuard);
      lifecycle.addActivateGuard("orders", () => ordersActivateGuard);
      lifecycle.addActivateGuard("orders.pending", () => pendingActivateGuard);

      const navigationPromise = router.navigate("orders.pending");

      await vi.runAllTimersAsync();

      await expect(navigationPromise).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(ordersActivateGuard).toHaveBeenCalledTimes(1);
      expect(pendingActivateGuard).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should cancel when navigation superseded after async guard resolves in same phase", async () => {
    vi.useFakeTimers();

    try {
      await router.navigate("users.view", { id: 123 });

      lifecycle.addDeactivateGuard(
        "users.view",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 10),
          ),
      );
      lifecycle.addDeactivateGuard("users", () => () => true);

      const p1 = router.navigate("orders.pending");

      void router.navigate("home");

      await vi.runAllTimersAsync();

      await expect(p1).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("should complete when async deactivate resolves with no activate phase", async () => {
    await router.navigate("users.view", { id: 123 });

    lifecycle.addDeactivateGuard(
      "users.view",
      () => () => Promise.resolve(true),
    );

    const state = await router.navigate("users");

    expect(state.name).toBe("users");
  });

  it("should cancel between async deactivate and activate phases", async () => {
    vi.useFakeTimers();

    try {
      await router.navigate("users");

      lifecycle.addDeactivateGuard(
        "users",
        () => () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              resolve(true);
            }, 10),
          ),
      );

      const activateGuard = vi.fn().mockReturnValue(true);

      lifecycle.addActivateGuard("orders", () => activateGuard);

      const p1 = router.navigate("orders.pending");

      void router.navigate("home");

      await vi.runAllTimersAsync();

      await expect(p1).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      expect(activateGuard).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
