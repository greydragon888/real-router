import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;
const noop = () => undefined;

describe("router.navigate() - transitions and cancellation", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  it("concurrent navigate to the same route yields SAME_STATES (no cancellation)", async () => {
    // No async guards → the first navigate to "users" resolves; because it is
    // already the committed target, every concurrent navigate to the same route
    // rejects with SAME_STATES. This is NOT cancellation — assert the exact code.
    const first = router.navigate("users");
    const concurrent = Array.from({ length: 4 }, () =>
      router.navigate("users"),
    );

    const firstState = await first;

    expect(firstState.name).toBe("users");

    await Promise.all(
      concurrent.map((promise) =>
        expect(promise).rejects.toMatchObject({
          code: errorCodes.SAME_STATES,
        }),
      ),
    );
  });

  it("a newer navigate cancels an in-flight async navigation with TRANSITION_CANCELLED", async () => {
    // An async deactivation guard on "home" pins the first navigation in-flight
    // (the transition cannot complete until the guard's Promise settles). A newer
    // navigate to a different route supersedes it → the first rejects with
    // TRANSITION_CANCELLED while the second commits. Real timers (no fake timers
    // in this describe) drive the guard's setTimeout.
    lifecycle.addDeactivateGuard(
      "home",
      () => () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(true);
          }, 50),
        ),
    );

    const p1 = router.navigate("users"); // hangs on async deactivation guard
    const p2 = router.navigate("orders"); // supersedes p1

    await expect(p1).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    const ordersState = await p2;

    expect(ordersState.name).toBe("orders");
  });

  it("should do nothing if stop is called after transition finished", async () => {
    await router.navigate("users");

    expect(router.getState()?.name).toBe("users");
    expect(() => {
      router.stop();
    }).not.toThrow();

    // Restart for afterEach cleanup
    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  it("should call middleware, activate, and deactivate hooks during navigation", async () => {
    vi.spyOn(console, "error").mockImplementation(noop);

    const middlewareMock1 = vi.fn().mockReturnValue(true);
    const middlewareMock2 = vi.fn().mockReturnValue(true);
    const activateMock = vi.fn().mockReturnValue(true);
    const deactivateMock = vi.fn().mockReturnValue(true);

    router.usePlugin(() => ({ onTransitionSuccess: middlewareMock1 as any }));
    router.usePlugin(() => ({ onTransitionSuccess: middlewareMock2 as any }));
    lifecycle.addActivateGuard("users", () => activateMock as any);
    lifecycle.addDeactivateGuard("users", () => deactivateMock as any);

    await router.navigate("users");

    expect(middlewareMock1).toHaveBeenCalledTimes(1);
    expect(middlewareMock2).toHaveBeenCalledTimes(1);
    expect(activateMock).toHaveBeenCalledTimes(1);

    await router.navigate("index");

    expect(middlewareMock1).toHaveBeenCalledTimes(2);
    expect(middlewareMock2).toHaveBeenCalledTimes(2);
    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  describe("Issue #36: Safe behavior when router.stop() is called during navigation", () => {
    // router.stop() called inside guard should cancel transition
    it("should cancel transition when router.stop() is called inside canActivate", async () => {
      lifecycle.addActivateGuard("users", () => () => {
        router.stop(); // Stop router during guard

        return true; // Guard returns true, but router is stopped
      });

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.code).toBe(errorCodes.TRANSITION_CANCELLED);
      }
    });
  });

  it("should cancel transition between guard iterations when router.stop() is called in a guard", async () => {
    const parentGuard = vi.fn().mockImplementation(() => {
      router.stop();

      return true;
    });

    const childGuard = vi.fn().mockReturnValue(true);

    lifecycle.addActivateGuard("settings", () => parentGuard);
    lifecycle.addActivateGuard("settings.account", () => childGuard);

    await expect(router.navigate("settings.account")).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });

    expect(parentGuard).toHaveBeenCalledTimes(1);
    expect(childGuard).not.toHaveBeenCalled();
  });

  describe("Issue #51: Concurrent Navigation Handling", () => {
    // Issue #51: When navigation is cancelled, Promise handlers continue executing
    // and resolve after cancellation, leading to race conditions.

    describe("Multiple cancellations", () => {
      it("should handle multiple stop() calls safely", async () => {
        const freshRouter = createTestRouter();

        getLifecycleApi(freshRouter).addActivateGuard(
          "users",
          () => () =>
            new Promise((resolve) =>
              setTimeout(() => {
                resolve(true);
              }, 100),
            ),
        );
        await freshRouter.start("/home");

        const promise = freshRouter.navigate("users");

        await new Promise((resolve) => setTimeout(resolve, 10));

        freshRouter.stop();
        freshRouter.stop();
        freshRouter.stop();

        try {
          await promise;

          expect.fail("Should have thrown error");
        } catch (error: any) {
          expect(error?.code).toBe(errorCodes.TRANSITION_CANCELLED);
        }
      });
    });
  });
});
