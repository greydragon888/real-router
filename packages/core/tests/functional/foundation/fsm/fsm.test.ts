import { describe, it, expect, vi } from "vitest";

import { FSM } from "../../../../src/foundation/fsm/fsm.js";

import type { FSMConfig } from "../../../../src/foundation/fsm/types.js";

type LightState = "green" | "yellow" | "red";
type LightEvent = "TIMER" | "RESET";

const lightConfig: FSMConfig<LightState, LightEvent, { count: number }> = {
  initial: "green",
  context: { count: 0 },
  transitions: {
    green: { TIMER: "yellow" },
    yellow: { TIMER: "red" },
    red: { TIMER: "green", RESET: "green" },
  },
};

type PayloadState = "idle" | "loading" | "done";
type PayloadEvent = "FETCH" | "RESOLVE" | "REJECT";
interface PayloadMap {
  FETCH: { url: string };
  REJECT: { error: string };
}

const payloadConfig: FSMConfig<PayloadState, PayloadEvent, null> = {
  initial: "idle",
  context: null,
  transitions: {
    idle: { FETCH: "loading" },
    loading: { RESOLVE: "done", REJECT: "idle" },
    done: {},
  },
};

describe("FSM", () => {
  describe("Basic transitions", () => {
    it("should transition to the next state and return it", () => {
      const fsm = new FSM(lightConfig);

      const result = fsm.send("TIMER");

      expect(result).toBe("yellow");
      expect(fsm.getState()).toBe("yellow");
    });

    it("should no-op and return current state for unknown event", () => {
      const fsm = new FSM(lightConfig);

      const result = fsm.send("RESET");

      expect(result).toBe("green");
      expect(fsm.getState()).toBe("green");
    });

    it("should no-op at terminal state (empty transitions)", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      fsm.send("FETCH", { url: "/api" });
      fsm.send("RESOLVE");

      expect(fsm.getState()).toBe("done");

      const result = fsm.send("FETCH", { url: "/api" });

      expect(result).toBe("done");
      expect(fsm.getState()).toBe("done");
    });

    it("should support cyclic transitions", () => {
      const fsm = new FSM(lightConfig);

      fsm.send("TIMER");
      fsm.send("TIMER");
      fsm.send("TIMER");

      expect(fsm.getState()).toBe("green");
    });

    it("should fire onTransition for self-transitions (from === to)", () => {
      type S = "a";
      type E = "LOOP";

      const fsm = new FSM<S, E, null>({
        initial: "a",
        context: null,
        transitions: {
          a: { LOOP: "a" },
        },
      });

      const listener = vi.fn();

      fsm.onTransition(listener);

      fsm.send("LOOP");

      expect(listener).toHaveBeenCalledExactlyOnceWith({
        from: "a",
        to: "a",
        event: "LOOP",
        payload: undefined,
      });
    });
  });

  describe("Payload", () => {
    it("should pass required payload through to TransitionInfo", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      const listener = vi.fn();

      fsm.onTransition(listener);

      fsm.send("FETCH", { url: "/api/data" });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "FETCH",
          payload: { url: "/api/data" },
        }),
      );
    });

    it("should work without payload for no-payload events", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      fsm.send("FETCH", { url: "/api" });

      const listener = vi.fn();

      fsm.onTransition(listener);

      fsm.send("RESOLVE");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "RESOLVE",
          payload: undefined,
        }),
      );
    });

    it("should have undefined payload when not provided", () => {
      const fsm = new FSM(lightConfig);

      const listener = vi.fn();

      fsm.onTransition(listener);

      fsm.send("TIMER");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: undefined,
        }),
      );
    });

    it("should narrow TransitionInfo.payload by info.event (#886)", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );
      let url: string | undefined;

      fsm.onTransition((info) => {
        // TransitionInfo is a discriminated union over `event`, so checking
        // `info.event === "FETCH"` narrows `info.payload` to PayloadMap["FETCH"]
        // (= { url: string }) — the same correlation `on()` already gives actions.
        if (info.event === "FETCH") {
          url = info.payload.url;
        }
      });

      fsm.send("FETCH", { url: "/api/data" });

      expect(url).toBe("/api/data");
    });
  });

  describe("onTransition", () => {
    it("should receive correct TransitionInfo", () => {
      const fsm = new FSM(lightConfig);

      const listener = vi.fn();

      fsm.onTransition(listener);

      fsm.send("TIMER");

      expect(listener).toHaveBeenCalledWith({
        from: "green",
        to: "yellow",
        event: "TIMER",
        payload: undefined,
      });
    });

    it("should call multiple listeners in subscription order", () => {
      const fsm = new FSM(lightConfig);

      const order: number[] = [];

      fsm.onTransition(() => order.push(1));
      fsm.onTransition(() => order.push(2));
      fsm.onTransition(() => order.push(3));

      fsm.send("TIMER");

      expect(order).toStrictEqual([1, 2, 3]);
    });

    it("should not call unsubscribed listener", () => {
      const fsm = new FSM(lightConfig);

      const listener = vi.fn();
      const unsub = fsm.onTransition(listener);

      unsub();

      fsm.send("TIMER");

      expect(listener).not.toHaveBeenCalled();
    });

    it("should NOT be called on no-op", () => {
      const fsm = new FSM(lightConfig);

      const listener = vi.fn();

      fsm.onTransition(listener);

      fsm.send("RESET");

      expect(listener).not.toHaveBeenCalled();
    });

    it("should safely handle unsubscribe during iteration (null-slot pattern)", () => {
      const fsm = new FSM(lightConfig);

      const calls: string[] = [];
      let unsub2: () => void;

      fsm.onTransition(() => {
        calls.push("first");
        unsub2();
      });
      unsub2 = fsm.onTransition(() => calls.push("second"));
      fsm.onTransition(() => calls.push("third"));

      fsm.send("TIMER");

      expect(calls).toStrictEqual(["first", "third"]);
    });

    it("should propagate listener exception (state already updated)", () => {
      const fsm = new FSM(lightConfig);

      const error = new Error("boom");

      fsm.onTransition(() => {
        throw error;
      });

      expect(() => fsm.send("TIMER")).toThrow(error);
      expect(fsm.getState()).toBe("yellow");
    });

    it("should support reentrancy (send() inside listener)", () => {
      const fsm = new FSM(lightConfig);

      const states: string[] = [];

      fsm.onTransition(({ to }) => {
        states.push(to);
        if (to === "yellow") {
          fsm.send("TIMER");
        }
      });

      fsm.send("TIMER");

      expect(fsm.getState()).toBe("red");
      expect(states).toStrictEqual(["yellow", "red"]);
    });

    it("should transition without listeners (no allocation)", () => {
      const fsm = new FSM(lightConfig);

      const result = fsm.send("TIMER");

      expect(result).toBe("yellow");
    });

    it("should handle double-unsubscribe safely", () => {
      const fsm = new FSM(lightConfig);

      const listener = vi.fn();
      const unsub = fsm.onTransition(listener);

      unsub();
      unsub();

      fsm.send("TIMER");

      expect(listener).not.toHaveBeenCalled();
    });

    it("should reuse null slots for new listeners", () => {
      const fsm = new FSM(lightConfig);

      const calls: string[] = [];

      const unsub1 = fsm.onTransition(() => calls.push("a"));

      fsm.onTransition(() => calls.push("b"));

      unsub1();

      fsm.onTransition(() => calls.push("c"));

      fsm.send("TIMER");

      expect(calls).toStrictEqual(["c", "b"]);
    });

    it("should not corrupt the listener count on double-unsubscribe (other listeners keep firing)", () => {
      const fsm = new FSM(lightConfig);
      const a = vi.fn();
      const b = vi.fn();

      const unsubA = fsm.onTransition(a);

      fsm.onTransition(b);

      // The `subscribed` latch must make the 2nd unsub a true no-op. Without it
      // (`!subscribed → false`, emptied block, or `subscribed = true`), the
      // cleanup runs twice and decrements #listenerCount past the live count → the
      // `> 0` gate then wrongly skips the loop and b is never called.
      unsubA();
      unsubA();

      fsm.send("TIMER");

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });
  });

  describe("on()", () => {
    it("should call action on matching (from, event) with correct payload", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      const action = vi.fn();

      fsm.on("idle", "FETCH", action);

      fsm.send("FETCH", { url: "/api/data" });

      expect(action).toHaveBeenCalledExactlyOnceWith({ url: "/api/data" });
    });

    it("should NOT call action when from-state doesn't match", () => {
      const fsm = new FSM(lightConfig);

      const action = vi.fn();

      fsm.on("red", "TIMER", action);

      fsm.send("TIMER");

      expect(action).not.toHaveBeenCalled();
      expect(fsm.getState()).toBe("yellow");
    });

    it("should NOT call action on no-op send", () => {
      const fsm = new FSM(lightConfig);

      const action = vi.fn();

      fsm.on("green", "RESET", action);

      fsm.send("RESET");

      expect(action).not.toHaveBeenCalled();
    });

    it("should not fire after unsubscribe", () => {
      const fsm = new FSM(lightConfig);

      const action = vi.fn();
      const unsub = fsm.on("green", "TIMER", action);

      unsub();

      fsm.send("TIMER");

      expect(action).not.toHaveBeenCalled();
    });

    it("should support multiple actions for different (from, event) pairs", () => {
      const fsm = new FSM(lightConfig);

      const calls: string[] = [];

      fsm.on("green", "TIMER", () => calls.push("green→yellow"));
      fsm.on("yellow", "TIMER", () => calls.push("yellow→red"));

      fsm.send("TIMER");
      fsm.send("TIMER");

      expect(calls).toStrictEqual(["green→yellow", "yellow→red"]);
    });

    it("should fire before onTransition listeners", () => {
      const fsm = new FSM(lightConfig);

      const order: string[] = [];

      fsm.onTransition(() => order.push("listener"));
      fsm.on("green", "TIMER", () => order.push("action"));

      fsm.send("TIMER");

      expect(order).toStrictEqual(["action", "listener"]);
    });

    it("should overwrite previous action for same (from, event)", () => {
      const fsm = new FSM(lightConfig);

      const first = vi.fn();
      const second = vi.fn();

      fsm.on("green", "TIMER", first);
      fsm.on("green", "TIMER", second);

      fsm.send("TIMER");

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("should not delete overwritten action when old unsubscribe is called", () => {
      const fsm = new FSM(lightConfig);

      const first = vi.fn();
      const second = vi.fn();

      const unsub1 = fsm.on("green", "TIMER", first);

      fsm.on("green", "TIMER", second);

      unsub1();

      fsm.send("TIMER");

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("should receive undefined payload for no-payload events", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      fsm.send("FETCH", { url: "/api" });

      const action = vi.fn();

      fsm.on("loading", "RESOLVE", action);

      fsm.send("RESOLVE");

      expect(action).toHaveBeenCalledExactlyOnceWith(undefined);
    });

    it("should keep a prior same-from-state action when a second event is registered (per-pair, not per-state)", () => {
      const fsm = new FSM(lightConfig);
      const onTimer = vi.fn();
      const onReset = vi.fn();

      // Both actions share the from-state "red" but differ by event. The second
      // on() must REUSE the existing per-state Map, not replace it — a
      // `!stateActions → true` mutant rebuilds the Map and drops onTimer.
      fsm.on("red", "TIMER", onTimer);
      fsm.on("red", "RESET", onReset);

      // Reach "red" through the transition table (green→yellow→red).
      fsm.send("TIMER"); // green → yellow
      fsm.send("TIMER"); // yellow → red
      fsm.send("TIMER"); // red --TIMER--> green, must still fire the first action

      expect(onTimer).toHaveBeenCalledTimes(1);
    });
  });

  describe("getContext()", () => {
    it("should return the same reference as config", () => {
      const context = { count: 0 };
      const fsm = new FSM<LightState, LightEvent, { count: number }>({
        ...lightConfig,
        context,
      });

      expect(fsm.getContext()).toBe(context);
    });

    it("should reflect external mutations", () => {
      const context = { count: 0 };
      const fsm = new FSM<LightState, LightEvent, { count: number }>({
        ...lightConfig,
        context,
      });

      context.count = 42;

      expect(fsm.getContext().count).toBe(42);
    });
  });

  describe("canSend()", () => {
    it("should return true for valid event in current state", () => {
      const fsm = new FSM(lightConfig);

      expect(fsm.canSend("TIMER")).toBe(true);
    });

    it("should return false for invalid event in current state", () => {
      const fsm = new FSM(lightConfig);

      expect(fsm.canSend("RESET")).toBe(false);
    });

    it("should return false for terminal state (no transitions)", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      fsm.send("FETCH", { url: "/api" });
      fsm.send("RESOLVE");

      expect(fsm.getState()).toBe("done");
      expect(fsm.canSend("FETCH")).toBe(false);
      expect(fsm.canSend("RESOLVE")).toBe(false);
    });

    it("should reflect state changes after send()", () => {
      const fsm = new FSM(lightConfig);

      expect(fsm.canSend("RESET")).toBe(false);

      fsm.send("TIMER");
      fsm.send("TIMER");

      expect(fsm.getState()).toBe("red");
      expect(fsm.canSend("RESET")).toBe(true);
    });

    it("should return correct value during onTransition callback", () => {
      const fsm = new FSM(lightConfig);

      let canSendTimerDuringTransition: boolean | undefined;

      fsm.onTransition(({ to }) => {
        if (to === "yellow") {
          canSendTimerDuringTransition = fsm.canSend("TIMER");
        }
      });

      fsm.send("TIMER");

      expect(canSendTimerDuringTransition).toBe(true);
    });

    it("should reject invalid event names", () => {
      const fsm = new FSM(lightConfig);

      // @ts-expect-error — invalid event
      expect(fsm.canSend("INVALID")).toBe(false);
    });
  });

  describe("getState()", () => {
    it("should return initial state after creation", () => {
      const fsm = new FSM(lightConfig);

      expect(fsm.getState()).toBe("green");
    });

    it("should return new state after send()", () => {
      const fsm = new FSM(lightConfig);

      fsm.send("TIMER");

      expect(fsm.getState()).toBe("yellow");
    });

    it("should return current state after no-op send()", () => {
      const fsm = new FSM(lightConfig);

      fsm.send("RESET");

      expect(fsm.getState()).toBe("green");
    });
  });

  describe("TypeScript type safety", () => {
    it("should reject invalid event names", () => {
      const fsm = new FSM(lightConfig);

      // @ts-expect-error — invalid event
      fsm.send("INVALID");

      expect(fsm.getState()).toBe("green");
    });

    it("should reject a payload typed for a different event (#753)", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      // FETCH's payload is { url: string }; REJECT's { error: string } is a
      // different event's payload and must not satisfy FETCH.
      // @ts-expect-error — send() must correlate the payload to the specific event
      fsm.send("FETCH", { error: "boom" });

      // The correctly-typed payload still compiles (positive control).
      fsm.send("FETCH", { url: "/api" });

      expect(fsm.getState()).toBe("loading");
    });

    it("should reject extra payload for a no-payload event (runtime still ignores it)", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      fsm.send("FETCH", { url: "/api" });

      // RESOLVE has no entry in PayloadMap, so it accepts no payload.
      // @ts-expect-error — a no-payload event must not receive a payload
      fsm.send("RESOLVE", { data: "something" });

      expect(fsm.getState()).toBe("done");
    });

    it("should require the payload for a payload event at the type level (runtime stays lenient)", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      // FETCH declares a payload, so omitting it is now a type error.
      // @ts-expect-error — a payload event requires its payload argument
      fsm.send("FETCH");

      expect(fsm.getState()).toBe("loading");
    });
  });

  describe("on() action edge cases", () => {
    it("should propagate exception from on() action callback through send()", () => {
      const fsm = new FSM(lightConfig);
      const error = new Error("action boom");

      fsm.on("green", "TIMER", () => {
        throw error;
      });

      expect(() => fsm.send("TIMER")).toThrow(error);
      // State is already updated before action fires
      expect(fsm.getState()).toBe("yellow");
    });

    it("should allow reentrancy — calling send() inside on() action", () => {
      const fsm = new FSM(lightConfig);
      const states: string[] = [];

      fsm.on("green", "TIMER", () => {
        states.push(fsm.getState());
        // State is already "yellow" at this point, send another TIMER
        fsm.send("TIMER");
      });

      fsm.send("TIMER");

      expect(states).toStrictEqual(["yellow"]);
      expect(fsm.getState()).toBe("red");
    });

    it("should return valid canSend result inside on() action", () => {
      const fsm = new FSM(lightConfig);
      let canSendTimer: boolean | undefined;
      let canSendReset: boolean | undefined;

      fsm.on("green", "TIMER", () => {
        // Inside action, state is already "yellow"
        canSendTimer = fsm.canSend("TIMER");
        canSendReset = fsm.canSend("RESET");
      });

      fsm.send("TIMER");

      // yellow has TIMER→red, no RESET
      expect(canSendTimer).toBe(true);
      expect(canSendReset).toBe(false);
    });
  });

  describe("Declared-state guard (#885 / #1159)", () => {
    // The declared-state invariant must hold at every state-entry-point — the
    // constructor's `initial`, `on`'s `from` (#885), and every transition
    // target in the table (#1159). Reachable with string-typed states / JS /
    // cast callers.
    it("should throw when constructed with an undeclared initial state", () => {
      expect(
        () =>
          new FSM<string, string, null>({
            initial: "GHOST",
            context: null,
            transitions: { a: { go: "b" }, b: {} },
          }),
      ).toThrow(
        '[FSM.constructor] state "GHOST" is not declared in config.transitions',
      );
    });

    it("should throw when on() targets an undeclared from-state", () => {
      const fsm = new FSM<string, string, null>({
        initial: "a",
        context: null,
        transitions: { a: { go: "b" }, b: {} },
      });

      expect(() => {
        fsm.on("GHOST", "go", () => {});
      }).toThrow(
        '[FSM.on] state "GHOST" is not declared in config.transitions',
      );
    });

    it("should throw when a transition target is an undeclared state (#1159)", () => {
      // The 4th state-entry-point: a table value (target) applied by send()
      // without re-checking. A dangling target must fail loud at construction
      // instead of bricking the FSM on the first send() into it.
      expect(
        () =>
          new FSM<string, string, null>({
            initial: "a",
            context: null,
            transitions: { a: { go: "GHOST" }, b: {} },
          }),
      ).toThrow(
        '[FSM.constructor] state "GHOST" is not declared in config.transitions',
      );
    });

    it("allows an explicit undefined target — preserves send()'s no-op semantics (#1159)", () => {
      // An explicit `undefined` value is a declared no-op (send() returns the
      // current state), NOT a dangling target — closure validation must skip it.
      expect(
        () =>
          new FSM<string, string, null>({
            initial: "a",
            context: null,
            transitions: { a: { go: undefined }, b: {} },
          }),
      ).not.toThrow();
    });
  });
});
