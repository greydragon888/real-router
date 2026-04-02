import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { getInternals } from "../../../../src/internals";
import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

let router: Router;
let lifecycle: LifecycleApi;

describe("router.navigate() - events transition leave approve (RFC §9.2)", () => {
  beforeEach(async () => {
    router = createTestRouter();

    await router.start("/home");

    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();

    vi.clearAllMocks();
  });

  describe("TRANSITION_LEAVE_APPROVE event ordering", () => {
    it("fires after deactivation guard, before activation guard (invocationCallOrder verified)", async () => {
      const callOrder: string[] = [];

      lifecycle.addDeactivateGuard("home", () => () => {
        callOrder.push("deactivate");

        return true;
      });

      lifecycle.addActivateGuard("users", () => () => {
        callOrder.push("activate");

        return true;
      });

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          callOrder.push("leaveApprove");
        },
      );

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "deactivate",
        "leaveApprove",
        "activate",
      ]);

      unsubLeave();
    });

    it("does NOT fire when deactivation guard blocks (returns false)", async () => {
      const onLeaveApprove = vi.fn();

      lifecycle.addDeactivateGuard("home", () => () => false);

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        onLeaveApprove,
      );

      try {
        await router.navigate("users");

        expect.fail("Should have thrown error");
      } catch (error) {
        expect((error as { code?: string }).code).toBe(
          errorCodes.CANNOT_DEACTIVATE,
        );
        expect(onLeaveApprove).not.toHaveBeenCalled();
      }

      unsubLeave();
    });

    it("fires with forceDeactivate: true — deactivation guards skipped, LEAVE_APPROVE still fires", async () => {
      const deactivateGuard = vi.fn().mockReturnValue(false);
      const onLeaveApprove = vi.fn();

      lifecycle.addDeactivateGuard("home", () => deactivateGuard);

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        onLeaveApprove,
      );

      await router.navigate("users", {}, { forceDeactivate: true });

      expect(deactivateGuard).not.toHaveBeenCalled();
      expect(onLeaveApprove).toHaveBeenCalledTimes(1);

      unsubLeave();
    });

    it("fires with async deactivation guards — after await, before activation", async () => {
      const callOrder: string[] = [];

      lifecycle.addDeactivateGuard("home", () => async () => {
        await Promise.resolve();
        callOrder.push("deactivate");

        return true;
      });

      lifecycle.addActivateGuard("users", () => () => {
        callOrder.push("activate");

        return true;
      });

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          callOrder.push("leaveApprove");
        },
      );

      await router.navigate("users");

      expect(callOrder).toStrictEqual([
        "deactivate",
        "leaveApprove",
        "activate",
      ]);

      unsubLeave();
    });

    it("does NOT fire for navigateToNotFound — pipeline bypass", () => {
      const onLeaveApprove = vi.fn();

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        onLeaveApprove,
      );

      router.navigateToNotFound("/not-a-real-path");

      expect(onLeaveApprove).not.toHaveBeenCalled();

      unsubLeave();
    });

    it("does NOT fire for same-state navigation — fast-path rejection", async () => {
      await router.navigate("users");

      const onLeaveApprove = vi.fn();

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        onLeaveApprove,
      );

      try {
        await router.navigate("users");

        expect.fail("Should have thrown SAME_STATES error");
      } catch (error) {
        expect((error as { code?: string }).code).toBe(errorCodes.SAME_STATES);
        expect(onLeaveApprove).not.toHaveBeenCalled();
      }

      unsubLeave();
    });

    it("reentrant navigate from LEAVE_APPROVE listener supersedes original navigation", async () => {
      let leaveApproveCalledForUsers = false;
      let reentrantNavPromise: Promise<unknown> | undefined;

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        (toState) => {
          if (toState.name === "users" && !leaveApproveCalledForUsers) {
            leaveApproveCalledForUsers = true;
            reentrantNavPromise = router.navigate("orders");
          }
        },
      );

      const originalNav = router.navigate("users");

      await expect(originalNav).rejects.toMatchObject({
        code: errorCodes.TRANSITION_CANCELLED,
      });

      await reentrantNavPromise;

      expect(router.getState()?.name).toBe("orders");
      expect(leaveApproveCalledForUsers).toBe(true);

      unsubLeave();
    });

    it("router is still transitioning when LEAVE_APPROVE fires (state not yet committed)", async () => {
      let isTransitioningDuringLeaveApprove: boolean | undefined;
      let stateNameDuringLeaveApprove: string | undefined;

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          isTransitioningDuringLeaveApprove =
            getInternals(router).isTransitioning();
          stateNameDuringLeaveApprove = router.getState()?.name;
        },
      );

      await router.navigate("users");

      expect(isTransitioningDuringLeaveApprove).toBe(true);
      expect(stateNameDuringLeaveApprove).toBe("home");

      unsubLeave();
    });

    it("fires when hasGuards === false (zero guards — emitLeaveApprove called directly)", async () => {
      const onLeaveApprove = vi.fn();

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        onLeaveApprove,
      );

      await router.navigate("users");

      expect(onLeaveApprove).toHaveBeenCalledTimes(1);
      expect(onLeaveApprove).toHaveBeenCalledWith(
        expect.objectContaining({ name: "users" }),
        expect.objectContaining({ name: "home" }),
      );

      unsubLeave();
    });
  });
});
