import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { events, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { captureSyncThrow, createTestRouter } from "../../../helpers";

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

      // #1200 item 11: `.rejects` instead of a try/catch with `expect.fail` inside
      // the try — the old form could mask a non-throw if the expected code were
      // ever undefined (the swallowed AssertionError's absent code would match).
      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.CANNOT_DEACTIVATE,
      });
      expect(onLeaveApprove).not.toHaveBeenCalled();

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

      await router.navigate("users", {}, undefined, { forceDeactivate: true });

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

      // #1200 item 11: `.rejects` instead of a try/catch with `expect.fail`.
      await expect(router.navigate("users")).rejects.toMatchObject({
        code: errorCodes.SAME_STATES,
      });
      expect(onLeaveApprove).not.toHaveBeenCalled();

      unsubLeave();
    });

    it("reentrant navigate from a LEAVE_APPROVE listener is banned (REENTRANT_NAVIGATION); original completes", async () => {
      // RFC §4: a synchronous navigate() from inside a TRANSITION_LEAVE_APPROVE
      // listener runs while the emit is on the stack (isProcessing) → it throws
      // REENTRANT_NAVIGATION at the facade instead of superseding the original.
      let leaveApproveCalledForUsers = false;
      let captured: unknown;

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        (toState) => {
          if (toState.name === "users" && !leaveApproveCalledForUsers) {
            leaveApproveCalledForUsers = true;
            captured = captureSyncThrow(() => router.navigate("orders"));
          }
        },
      );

      const state = await router.navigate("users");

      expect(captured).toMatchObject({
        code: errorCodes.REENTRANT_NAVIGATION,
      });
      // Original navigation was NOT superseded — it committed normally.
      expect(state.name).toBe("users");
      expect(router.getState()?.name).toBe("users");
      expect(leaveApproveCalledForUsers).toBe(true);

      unsubLeave();
    });

    it("state is not yet committed when LEAVE_APPROVE fires (still mid-transition)", async () => {
      let isLeaveApprovedDuring: boolean | undefined;
      let stateNameDuringLeaveApprove: string | undefined;

      const unsubLeave = getPluginApi(router).addEventListener(
        events.TRANSITION_LEAVE_APPROVE,
        () => {
          // Public proof of "mid-transition, not committed": we are in the
          // LEAVE_APPROVED phase AND the old route is still the committed state.
          isLeaveApprovedDuring = router.isLeaveApproved();
          stateNameDuringLeaveApprove = router.getState()?.name;
        },
      );

      await router.navigate("users");

      expect(isLeaveApprovedDuring).toBe(true);
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
