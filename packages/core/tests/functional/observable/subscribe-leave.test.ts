import { EventEmitter } from "event-emitter";
import { describe, it, expect, beforeEach } from "vitest";

import { DEFAULT_TRANSITION } from "../../../src/constants";
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

const TO_STATE: State = {
  name: "users",
  path: "/users",
  params: {},
  transition: DEFAULT_TRANSITION,
  context: {},
};
const FROM_STATE: State = {
  name: "home",
  path: "/home",
  params: {},
  transition: DEFAULT_TRANSITION,
  context: {},
};

describe("core/observable/subscribeLeave", () => {
  let bus: EventBusNamespace;
  let signal: AbortSignal;

  beforeEach(() => {
    bus = createEventBus();
    bus.sendStart();
    bus.sendStarted();
    bus.sendNavigate(TO_STATE, FROM_STATE);
    signal = new AbortController().signal;
  });

  describe("subscribeLeave basic functionality", () => {
    it("receives correct { route: fromState, nextRoute: toState, signal } when awaitLeaveListeners is called", () => {
      const listener = vi.fn();

      bus.subscribeLeave(listener);
      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(listener).toHaveBeenCalledExactlyOnceWith({
        route: FROM_STATE,
        nextRoute: TO_STATE,
        signal,
      });
    });

    it("returns unsubscribe — after calling it, callback is NOT called", () => {
      const listener = vi.fn();
      const unsub = bus.subscribeLeave(listener);

      unsub();
      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(listener).not.toHaveBeenCalled();
    });

    it("multiple subscribeLeave listeners — all called in registration order", () => {
      const calls: number[] = [];

      bus.subscribeLeave(() => {
        calls.push(1);
      });
      bus.subscribeLeave(() => {
        calls.push(2);
      });
      bus.subscribeLeave(() => {
        calls.push(3);
      });

      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(calls).toStrictEqual([1, 2, 3]);
    });

    it("NOT called when fromState is undefined", () => {
      const listener = vi.fn();

      bus.subscribeLeave(listener);

      const result = bus.awaitLeaveListeners(TO_STATE, undefined, signal);

      expect(listener).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });

  describe("hasLeaveListeners", () => {
    it("returns false when no listeners registered", () => {
      expect(bus.hasLeaveListeners()).toBe(false);
    });

    it("returns true after registering a listener", () => {
      bus.subscribeLeave(() => {});

      expect(bus.hasLeaveListeners()).toBe(true);
    });

    it("returns false after unsubscribing all listeners", () => {
      const unsub1 = bus.subscribeLeave(() => {});
      const unsub2 = bus.subscribeLeave(() => {});

      unsub1();
      unsub2();

      expect(bus.hasLeaveListeners()).toBe(false);
    });

    it("double-unsubscribe is safe (no-op on second call)", () => {
      const unsub = bus.subscribeLeave(() => {});

      unsub();
      unsub();

      expect(bus.hasLeaveListeners()).toBe(false);
    });
  });

  describe("awaitLeaveListeners", () => {
    it("returns undefined for sync listeners", () => {
      bus.subscribeLeave(() => {});

      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(result).toBeUndefined();
    });

    it("returns Promise for async listeners", () => {
      bus.subscribeLeave(async () => {});

      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(result).toBeInstanceOf(Promise);
    });

    it("returns undefined when no listeners registered", () => {
      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(result).toBeUndefined();
    });

    it("sync throw does not block other listeners", () => {
      const calls: number[] = [];

      bus.subscribeLeave(() => {
        throw new Error("first");
      });
      bus.subscribeLeave(() => {
        calls.push(2);
      });
      bus.subscribeLeave(() => {
        calls.push(3);
      });

      expect(() =>
        bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal),
      ).toThrow("first");
      expect(calls).toStrictEqual([2, 3]);
    });

    it("multiple sync throws: first error is thrown, subsequent are discarded", () => {
      bus.subscribeLeave(() => {
        throw new Error("first");
      });
      bus.subscribeLeave(() => {
        throw new Error("second");
      });

      expect(() =>
        bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal),
      ).toThrow("first");
    });

    it("sync error priority over async error", async () => {
      const syncError = new Error("sync");

      bus.subscribeLeave(() => {
        throw syncError;
      });
      bus.subscribeLeave(async () => {
        throw new Error("async");
      });

      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(result).toBeInstanceOf(Promise);

      await expect(result).rejects.toBe(syncError);
    });

    it("async rejection propagates", async () => {
      const asyncError = new Error("async");

      bus.subscribeLeave(async () => {
        throw asyncError;
      });

      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(result).toBeInstanceOf(Promise);

      await expect(result).rejects.toBe(asyncError);
    });

    it("mixed sync + async: all listeners execute", async () => {
      const calls: number[] = [];

      bus.subscribeLeave(() => {
        calls.push(1);
      });
      bus.subscribeLeave(async () => {
        calls.push(2);
      });
      bus.subscribeLeave(() => {
        calls.push(3);
      });

      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(result).toBeInstanceOf(Promise);

      await result;

      expect(calls).toStrictEqual([1, 2, 3]);
    });
  });

  // #663 — pipeline must not block on a listener that ignores its abort
  // signal. The race rejects the awaitLeaveListeners promise with
  // signal.reason as soon as the controller aborts; the hung listener
  // promise is abandoned (may still complete in background).
  describe("awaitLeaveListeners — signal race", () => {
    it("rejects with signal.reason when controller aborts mid-await", async () => {
      const controller = new AbortController();
      const abortReason = new RouterError("CANCELLED");

      bus.subscribeLeave(() => new Promise<void>(() => {}));

      const result = bus.awaitLeaveListeners(
        TO_STATE,
        FROM_STATE,
        controller.signal,
      );

      controller.abort(abortReason);

      await expect(result).rejects.toBe(abortReason);
    });

    it("rejects immediately when signal is already aborted on entry", async () => {
      const controller = new AbortController();
      const abortReason = new RouterError("CANCELLED");

      controller.abort(abortReason);

      bus.subscribeLeave(() => new Promise<void>(() => {}));

      const result = bus.awaitLeaveListeners(
        TO_STATE,
        FROM_STATE,
        controller.signal,
      );

      await expect(result).rejects.toBe(abortReason);
    });

    it("resolves normally when listeners settle before abort fires", async () => {
      const controller = new AbortController();
      let called = false;

      bus.subscribeLeave(async () => {
        called = true;
      });

      const result = bus.awaitLeaveListeners(
        TO_STATE,
        FROM_STATE,
        controller.signal,
      );

      await result;

      expect(called).toBe(true);

      // Abort after natural completion must not affect the resolved promise
      controller.abort(new RouterError("CANCELLED"));
    });

    it("cooperatively-cancelling listener still propagates its own rejection", async () => {
      const controller = new AbortController();
      const listenerReason = new Error("listener cooperative cancel");

      bus.subscribeLeave(
        ({ signal: sig }) =>
          new Promise<void>((_, reject) => {
            sig.addEventListener(
              "abort",
              () => {
                reject(listenerReason);
              },
              {
                once: true,
              },
            );
          }),
      );

      const result = bus.awaitLeaveListeners(
        TO_STATE,
        FROM_STATE,
        controller.signal,
      );

      const abortReason = new RouterError("CANCELLED");

      controller.abort(abortReason);

      // Race winner is the signal arm — abortReason wins over listenerReason.
      // listenerReason still bubbles via the listener's promise but is
      // discarded by the pipeline (the navigation is already cancelling).
      await expect(result).rejects.toBe(abortReason);
    });
  });

  describe("clearAll", () => {
    it("clears leave listeners", () => {
      const listener = vi.fn();

      bus.subscribeLeave(listener);
      bus.clearAll();
      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(listener).not.toHaveBeenCalled();
      expect(bus.hasLeaveListeners()).toBe(false);
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

  // #662 — payload immutability and reentrant-subscribe snapshot.
  describe("awaitLeaveListeners — payload freeze and reentrant snapshot", () => {
    it("payload object is frozen — mutation attempts throw in strict mode", async () => {
      const captured: unknown[] = [];

      bus.subscribeLeave((payload) => {
        captured.push(payload);

        expect(Object.isFrozen(payload)).toBe(true);

        expect(() => {
          (payload as { extra?: string }).extra = "added";
        }).toThrow(TypeError);

        expect(() => {
          (payload as { route: unknown }).route = null;
        }).toThrow(TypeError);
      });

      const result = bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      await result;

      expect(captured).toHaveLength(1);
    });

    it("listener that reentrantly subscribes does NOT fire the new listener in the current emit cycle", async () => {
      const order: string[] = [];

      bus.subscribeLeave(() => {
        order.push("outer");
        bus.subscribeLeave(() => {
          order.push("added-during");
        });
      });

      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      // outer fired in this cycle; added-during is registered but NOT invoked
      expect(order).toStrictEqual(["outer"]);

      // ...and fires on the next emit (verifies the new listener is actually
      // registered, just not in the current snapshot)
      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      expect(order).toStrictEqual(["outer", "outer", "added-during"]);
    });

    it("listener that reentrantly unsubscribes itself does NOT skip other listeners in the current cycle", async () => {
      const order: string[] = [];
      let unsubFirst: (() => void) | undefined;

      unsubFirst = bus.subscribeLeave(() => {
        order.push("first");
        unsubFirst?.();
      });
      bus.subscribeLeave(() => {
        order.push("second");
      });
      bus.subscribeLeave(() => {
        order.push("third");
      });

      void bus.awaitLeaveListeners(TO_STATE, FROM_STATE, signal);

      // All three fire — the snapshot taken on entry to awaitLeaveListeners
      // preserves the original list even after the first listener splices
      // itself out mid-iteration.
      expect(order).toStrictEqual(["first", "second", "third"]);
    });
  });
});
