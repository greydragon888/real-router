import { describe, it, expect, beforeEach } from "vitest";

import {
  createRouterFSM,
  routerStates,
  routerEvents,
} from "../../../src/fsm/routerFSM";

import type {
  RouterState,
  RouterEvent,
  RouterPayloads,
} from "../../../src/fsm/routerFSM";
import type { FSM } from "@real-router/fsm";

type RouterFSM = FSM<RouterState, RouterEvent, null, RouterPayloads>;

function buildFsmInState(state: RouterState): RouterFSM {
  const fsm = createRouterFSM();

  fsm.forceState(state);

  return fsm;
}

describe("routerFSM — LEAVE_APPROVED state", () => {
  let fsm: RouterFSM;

  describe("from TRANSITION_STARTED", () => {
    beforeEach(() => {
      fsm = buildFsmInState(routerStates.TRANSITION_STARTED);
    });

    it("canSend(LEAVE_APPROVE) is true — LEAVE_APPROVE triggers LEAVE_APPROVED", () => {
      expect(fsm.canSend(routerEvents.LEAVE_APPROVE)).toBe(true);
    });

    it("LEAVE_APPROVE transitions to LEAVE_APPROVED", () => {
      fsm.send(routerEvents.LEAVE_APPROVE);

      expect(fsm.getState()).toBe(routerStates.LEAVE_APPROVED);
    });

    it("NAVIGATE self-loop preserved — canSend(NAVIGATE) true", () => {
      expect(fsm.canSend(routerEvents.NAVIGATE)).toBe(true);
    });

    it("NAVIGATE self-loop stays in TRANSITION_STARTED", () => {
      fsm.send(routerEvents.NAVIGATE);

      expect(fsm.getState()).toBe(routerStates.TRANSITION_STARTED);
    });

    it("COMPLETE has NO transition from TRANSITION_STARTED — canSend(COMPLETE) false", () => {
      expect(fsm.canSend(routerEvents.COMPLETE)).toBe(false);
    });
  });

  describe("from LEAVE_APPROVED", () => {
    beforeEach(() => {
      fsm = buildFsmInState(routerStates.LEAVE_APPROVED);
    });

    it("COMPLETE transitions to READY", () => {
      fsm.send(routerEvents.COMPLETE);

      expect(fsm.getState()).toBe(routerStates.READY);
    });

    it("CANCEL transitions to READY", () => {
      fsm.send(routerEvents.CANCEL);

      expect(fsm.getState()).toBe(routerStates.READY);
    });

    it("FAIL transitions to READY", () => {
      fsm.send(routerEvents.FAIL);

      expect(fsm.getState()).toBe(routerStates.READY);
    });

    it("NAVIGATE transitions to TRANSITION_STARTED (reentrant navigate)", () => {
      fsm.send(routerEvents.NAVIGATE);

      expect(fsm.getState()).toBe(routerStates.TRANSITION_STARTED);
    });

    it("canSend(CANCEL) returns true", () => {
      expect(fsm.canSend(routerEvents.CANCEL)).toBe(true);
    });

    it("canSend(FAIL) returns true", () => {
      expect(fsm.canSend(routerEvents.FAIL)).toBe(true);
    });
  });

  describe("from READY", () => {
    beforeEach(() => {
      fsm = buildFsmInState(routerStates.READY);
    });

    it("canSend(LEAVE_APPROVE) returns false", () => {
      expect(fsm.canSend(routerEvents.LEAVE_APPROVE)).toBe(false);
    });
  });
});
