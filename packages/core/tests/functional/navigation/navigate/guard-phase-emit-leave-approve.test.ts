import { describe, beforeEach, it, expect, vi } from "vitest";

import { errorCodes } from "@real-router/core";

import { executeGuardPipeline } from "../../../../src/namespaces/NavigationNamespace/transition/guardPhase";

import type { GuardFn, State } from "@real-router/types";

const TO_STATE: State = {
  name: "users",
  path: "/users",
  params: {},
  context: {},
};
const FROM_STATE: State = {
  name: "home",
  path: "/home",
  params: {},
  context: {},
};
const SIGNAL: AbortSignal = new AbortController().signal;
const ALWAYS_ACTIVE = () => true;

function makeGuards(entries: [string, GuardFn][]): Map<string, GuardFn> {
  return new Map(entries);
}

describe("guardPhase — emitLeaveApprove callback", () => {
  let emitLeaveApprove: ReturnType<typeof vi.fn> &
    (() => Promise<void> | undefined);

  beforeEach(() => {
    emitLeaveApprove = vi.fn().mockReturnValue(undefined) as ReturnType<
      typeof vi.fn
    > &
      (() => Promise<void> | undefined);
  });

  it("called once after sync deactivation, before activation (call order verified)", () => {
    const callOrder: string[] = [];
    const deactivateGuard: GuardFn = vi.fn().mockImplementation(() => {
      callOrder.push("deactivate");

      return true;
    });
    const activateGuard: GuardFn = vi.fn().mockImplementation(() => {
      callOrder.push("activate");

      return true;
    });

    emitLeaveApprove.mockImplementation(() => {
      callOrder.push("leaveApprove");
    });

    const result = executeGuardPipeline(
      makeGuards([["home", deactivateGuard]]),
      makeGuards([["users", activateGuard]]),
      ["home"],
      ["users"],
      true,
      true,
      TO_STATE,
      FROM_STATE,
      SIGNAL,
      ALWAYS_ACTIVE,
      emitLeaveApprove,
    );

    expect(result).toBeUndefined();
    expect(callOrder).toStrictEqual(["deactivate", "leaveApprove", "activate"]);
    expect(emitLeaveApprove).toHaveBeenCalledTimes(1);
  });

  it("called after async deactivation resolves, before activation (async path)", async () => {
    const callOrder: string[] = [];
    const deactivateGuard: GuardFn = vi.fn().mockResolvedValue(true);
    const activateGuard: GuardFn = vi.fn().mockImplementation(() => {
      callOrder.push("activate");

      return true;
    });

    emitLeaveApprove.mockImplementation(() => {
      callOrder.push("leaveApprove");
    });

    const result = executeGuardPipeline(
      makeGuards([["home", deactivateGuard]]),
      makeGuards([["users", activateGuard]]),
      ["home"],
      ["users"],
      true,
      true,
      TO_STATE,
      FROM_STATE,
      SIGNAL,
      ALWAYS_ACTIVE,
      emitLeaveApprove,
    );

    expect(result).toBeInstanceOf(Promise);

    await result;

    expect(callOrder).toStrictEqual(["leaveApprove", "activate"]);
    expect(emitLeaveApprove).toHaveBeenCalledTimes(1);
  });

  it("NOT called when deactivation guard blocks (returns false → throws CANNOT_DEACTIVATE)", () => {
    const deactivateGuard: GuardFn = vi.fn().mockReturnValue(false);

    let thrownError: unknown;

    try {
      void executeGuardPipeline(
        makeGuards([["home", deactivateGuard]]),
        new Map(),
        ["home"],
        [],
        true,
        false,
        TO_STATE,
        FROM_STATE,
        SIGNAL,
        ALWAYS_ACTIVE,
        emitLeaveApprove,
      );
    } catch (error) {
      thrownError = error;
    }

    expect(thrownError).toMatchObject({ code: errorCodes.CANNOT_DEACTIVATE });
    expect(emitLeaveApprove).not.toHaveBeenCalled();
  });

  it("called when shouldDeactivate is false (no deactivation guards) and activation guards exist", () => {
    const activateGuard: GuardFn = vi.fn().mockReturnValue(true);

    void executeGuardPipeline(
      new Map(),
      makeGuards([["users", activateGuard]]),
      [],
      ["users"],
      false,
      true,
      TO_STATE,
      FROM_STATE,
      SIGNAL,
      ALWAYS_ACTIVE,
      emitLeaveApprove,
    );

    expect(emitLeaveApprove).toHaveBeenCalledTimes(1);
    expect(activateGuard).toHaveBeenCalledTimes(1);
  });
});
