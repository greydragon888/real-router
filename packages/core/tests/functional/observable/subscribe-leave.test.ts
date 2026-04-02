import { EventEmitter } from "event-emitter";
import { describe, it, expect, beforeEach } from "vitest";

import { createRouterFSM } from "../../../src/fsm/routerFSM";
import { EventBusNamespace } from "../../../src/namespaces/EventBusNamespace/EventBusNamespace";
import { RouterError } from "../../../src/RouterError";

import type { RouterEventMap } from "../../../src/types";
import type { State } from "@real-router/types";

function createEventBus(): EventBusNamespace {
  const routerFSM = createRouterFSM();
  // eslint-disable-next-line unicorn/prefer-event-target
  const emitter = new EventEmitter<RouterEventMap>({});

  return new EventBusNamespace({ routerFSM, emitter });
}

const TO_STATE: State = { name: "users", path: "/users", params: {} };
const FROM_STATE: State = { name: "home", path: "/home", params: {} };

describe("core/observable/subscribeLeave", () => {
  let bus: EventBusNamespace;

  beforeEach(() => {
    bus = createEventBus();
    bus.sendStart();
    bus.sendStarted();
    bus.sendNavigate(TO_STATE, FROM_STATE);
  });

  describe("subscribeLeave basic functionality", () => {
    it("receives correct { route: fromState, nextRoute: toState } when LEAVE_APPROVE fires", () => {
      const listener = vi.fn();

      bus.subscribeLeave(listener);
      bus.emitTransitionLeaveApprove(TO_STATE, FROM_STATE);

      expect(listener).toHaveBeenCalledExactlyOnceWith({
        route: FROM_STATE,
        nextRoute: TO_STATE,
      });
    });

    it("returns unsubscribe — after calling it, callback is NOT called", () => {
      const listener = vi.fn();
      const unsub = bus.subscribeLeave(listener);

      unsub();
      bus.emitTransitionLeaveApprove(TO_STATE, FROM_STATE);

      expect(listener).not.toHaveBeenCalled();
    });

    it("multiple subscribeLeave listeners — all called in registration order", () => {
      const calls: number[] = [];

      bus.subscribeLeave(() => calls.push(1));
      bus.subscribeLeave(() => calls.push(2));
      bus.subscribeLeave(() => calls.push(3));

      bus.emitTransitionLeaveApprove(TO_STATE, FROM_STATE);

      expect(calls).toStrictEqual([1, 2, 3]);
    });

    it("NOT called when fromState is undefined", () => {
      const listener = vi.fn();

      bus.subscribeLeave(listener);
      bus.emitTransitionLeaveApprove(TO_STATE);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("validateSubscribeLeaveListener", () => {
    it("throws TypeError when called with a non-function", () => {
      expect(() => {
        EventBusNamespace.validateSubscribeLeaveListener("not-a-function");
      }).toThrow(TypeError);

      expect(() => {
        EventBusNamespace.validateSubscribeLeaveListener("not-a-function");
      }).toThrow("[router.subscribeLeave] Expected a function");
    });

    it("does not throw when called with a function", () => {
      expect(() => {
        EventBusNamespace.validateSubscribeLeaveListener(() => {});
      }).not.toThrow();
    });
  });

  describe("FSM action: CANCEL from LEAVE_APPROVED", () => {
    it("emits TRANSITION_CANCEL event when cancelling from LEAVE_APPROVED state", () => {
      const cancelListener = vi.fn();

      bus.addEventListener("$$cancel", cancelListener);

      bus.sendLeaveApprove(TO_STATE, FROM_STATE);
      bus.sendCancel(TO_STATE, FROM_STATE);

      expect(cancelListener).toHaveBeenCalledExactlyOnceWith(
        TO_STATE,
        FROM_STATE,
      );
    });
  });

  describe("FSM action: FAIL from LEAVE_APPROVED", () => {
    it("emits TRANSITION_ERROR event when failing from LEAVE_APPROVED state", () => {
      const errorListener = vi.fn();
      const testError = new RouterError("TRANSITION_ERR", {
        message: "test error",
      });

      bus.addEventListener("$$error", errorListener);

      bus.sendLeaveApprove(TO_STATE, FROM_STATE);
      bus.sendFail(TO_STATE, FROM_STATE, testError);

      expect(errorListener).toHaveBeenCalledExactlyOnceWith(
        TO_STATE,
        FROM_STATE,
        testError,
      );
    });
  });

  describe("isLeaveApproved", () => {
    it("returns true when FSM is in LEAVE_APPROVED state, false otherwise", () => {
      expect(bus.isLeaveApproved()).toBe(false);

      bus.sendLeaveApprove(TO_STATE, FROM_STATE);

      expect(bus.isLeaveApproved()).toBe(true);

      bus.sendComplete(TO_STATE, FROM_STATE);

      expect(bus.isLeaveApproved()).toBe(false);
    });
  });
});
