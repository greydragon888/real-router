import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";
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
});
