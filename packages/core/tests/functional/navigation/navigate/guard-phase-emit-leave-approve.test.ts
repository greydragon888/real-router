import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

/**
 * LEAVE_APPROVE emission and guard ordering, through the REAL navigation
 * pipeline (`router.navigate` → NavigationNamespace → guardPhase). The previous
 * version called `executeGuardPipeline` directly with a hand-rolled
 * `emitLeaveApprove` mock, which skipped the `emitLeaveApproveCallback` wiring
 * (`sendLeaveApprove` / `hasLeaveListeners` / `awaitLeaveListeners`). Here the
 * observable is `router.subscribeLeave` — it fires exactly when the pipeline
 * emits LEAVE_APPROVE, so it proves both the emission count and the
 * deactivation → leave-approve → activation ordering end-to-end.
 */
describe("navigate() — LEAVE_APPROVE emission & guard order", () => {
  let router: Router;
  let lifecycle: LifecycleApi;

  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("emits leave-approve once, between deactivation and activation guards (sync)", async () => {
    const order: string[] = [];

    lifecycle.addDeactivateGuard("home", () => () => {
      order.push("deactivate");

      return true;
    });
    lifecycle.addActivateGuard("users", () => () => {
      order.push("activate");

      return true;
    });

    const leave = vi.fn(() => {
      order.push("leaveApprove");
    });

    router.subscribeLeave(leave);

    await router.navigate("users");

    expect(order).toStrictEqual(["deactivate", "leaveApprove", "activate"]);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("emits leave-approve after an async deactivation guard resolves, before activation", async () => {
    const order: string[] = [];

    lifecycle.addDeactivateGuard("home", () => async () => {
      order.push("deactivate");

      return true;
    });
    lifecycle.addActivateGuard("users", () => () => {
      order.push("activate");

      return true;
    });

    const leave = vi.fn(() => {
      order.push("leaveApprove");
    });

    router.subscribeLeave(leave);

    await router.navigate("users");

    expect(order).toStrictEqual(["deactivate", "leaveApprove", "activate"]);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("does NOT emit leave-approve when a deactivation guard blocks the transition", async () => {
    lifecycle.addDeactivateGuard("home", () => () => false);

    const leave = vi.fn();

    router.subscribeLeave(leave);

    await expect(router.navigate("users")).rejects.toMatchObject({
      code: errorCodes.CANNOT_DEACTIVATE,
    });
    expect(leave).not.toHaveBeenCalled();
  });

  it("emits leave-approve even with no deactivation guards (only activation guards)", async () => {
    const activate = vi.fn(() => true);

    lifecycle.addActivateGuard("users", () => activate);

    const leave = vi.fn();

    router.subscribeLeave(leave);

    await router.navigate("users");

    expect(leave).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);
  });

  /**
   * The NO-GUARDS half of this file, and the only one that needs its own
   * router: `createTestRouter`'s tree carries definition guards
   * (`admin-protected` / `auth-protected`), so `hasGuards` is unconditionally
   * true for the shared fixture and every test above enters `#executeNavigation`
   * through the guard branch. Nothing reached the other branch — which is how
   * the two `if (hasGuards)` arms came to run in sequence under a mutant with
   * the whole suite green.
   *
   * `#executeNavigation` splits the guard-free navigation in two: with no leave
   * listener it is `immediate` and returns from `#completeImmediate`; WITH one
   * it is suspendable, so `#handleNoGuardsLeave` emits LEAVE_APPROVE and the
   * guard branch must then stay shut. Running both would emit the phase twice
   * and call every `subscribeLeave` listener a second time.
   */
  describe("no guards registered", () => {
    let bare: Router;

    beforeEach(async () => {
      bare = createRouter([
        { name: "home", path: "/home" },
        { name: "users", path: "/users" },
      ]);

      await bare.start("/home");
    });

    afterEach(() => {
      if (bare.isActive()) {
        bare.stop();
      }
    });

    it("emits leave-approve exactly ONCE with a sync listener (no double dispatch)", async () => {
      const leave = vi.fn();
      const approve = vi.fn();

      bare.subscribeLeave(leave);
      bare.usePlugin(() => ({ onTransitionLeaveApprove: approve }));

      await bare.navigate("users");

      expect(leave).toHaveBeenCalledTimes(1);
      expect(approve).toHaveBeenCalledTimes(1);
    });

    it("emits leave-approve exactly ONCE with an async listener", async () => {
      const leave = vi.fn(async () => {
        await Promise.resolve();
      });

      bare.subscribeLeave(leave);

      await bare.navigate("users");

      expect(leave).toHaveBeenCalledTimes(1);
    });
  });
});
