import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, it, expect, vi } from "vitest";

import { FSM } from "../../../../src/utils/fsm/fsm.js";

import type {
  FSMConfig,
  TransitionTable,
} from "../../../../src/utils/fsm/types.js";

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

const payloadConfig: FSMConfig<PayloadState, PayloadEvent, null, PayloadMap> = {
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
      // `RESET` has no edge from `green`, so this used to be pinned by
      // REGISTERING an action there and asserting it never fired. Since #1682
      // that registration is refused outright, so the surviving half is the
      // send: a no-op send moves nothing and fires no action registered on the
      // pair that DOES have an edge.
      const fsm = new FSM(lightConfig);

      const action = vi.fn();

      fsm.on("green", "TIMER", action);

      fsm.send("RESET");

      expect(action).not.toHaveBeenCalled();
      expect(fsm.getState()).toBe("green");
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

    it("should throw when on() targets a pair with no edge (#1682)", () => {
      // The state guard above is one axis short of what it claims: `on()` also
      // has to refuse a DECLARED state paired with an event that has no edge
      // from it, because such an action can never fire. Measured radius before
      // this landed: one registration across 4651 tests.
      const fsm = new FSM<string, string, null>({
        initial: "a",
        context: null,
        transitions: { a: { go: "b" }, b: {} },
      });

      expect(() => {
        fsm.on("b", "go", () => {});
      }).toThrow('[FSM.on] event "go" has no edge from state "b"');
    });

    it("refuses the declared no-op target too — it is equally dead (#1682)", () => {
      // An explicit `undefined` is the declared "no transition" no-op. It is
      // dropped by `normalizeTable`, so the guard sees it exactly as an absent
      // pair and needs no branch of its own — pinned so a future normalisation
      // that KEEPS the key cannot silently re-open the hole.
      const fsm = new FSM<string, string, null>({
        initial: "a",
        context: null,
        // No cast: the table type already admits an explicit `undefined` value,
        // which is what makes the declared no-op expressible in the first place.
        transitions: { a: { go: "b", stay: undefined }, b: {} },
      });

      expect(() => {
        fsm.on("a", "stay", () => {});
      }).toThrow('[FSM.on] event "stay" has no edge from state "a"');
    });

    it.each(["toString", "constructor", "hasOwnProperty", "__proto__"])(
      'does not admit Object.prototype member "%s" as an edge (#1682)',
      (member) => {
        // The guard asks `Object.hasOwn`, not `member in edges`. `in` walks the
        // prototype chain, so the `in` form would accept these the moment the
        // normalised row stopped being null-prototype — a bypass reachable by
        // naming an event after a built-in. Pinned so the cheaper spelling
        // cannot come back.
        const fsm = new FSM<string, string, null>({
          initial: "a",
          context: null,
          transitions: { a: { go: "b" }, b: {} },
        });

        expect(() => {
          fsm.on("a", member, () => {});
        }).toThrow(`[FSM.on] event "${member}" has no edge from state "a"`);
      },
    );

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

  // --------------------------------------------------------------------------
  // Guarded transitions + typed context (RFC-10a §6.1/§6.2, invariants §13.1)
  // --------------------------------------------------------------------------
  describe("Guarded transitions (`when`) and context updates (`update`)", () => {
    type S = "idle" | "busy";
    type E = "GO" | "STOP";
    interface Ctx {
      epoch: number;
      log: string[];
    }
    interface P {
      GO: { token: number };
    }

    const build = (
      when?: (ctx: Ctx, p: { token: number } | undefined) => boolean,
      update?: (ctx: Ctx, p: { token: number } | undefined) => void,
    ) =>
      new FSM<S, E, Ctx, P>({
        initial: "idle",
        context: { epoch: 0, log: [] },
        transitions: {
          idle: { GO: { target: "busy", when, update } },
          busy: { STOP: "idle" },
        },
      });

    it("fires the transition when `when` returns true", () => {
      const fsm = build(() => true);

      expect(fsm.send("GO", { token: 1 })).toBe("busy");
    });

    it("§13.1-1 refusal equivalence — a false `when` is indistinguishable from an undeclared event", () => {
      const action = vi.fn();
      const listener = vi.fn();
      const update = vi.fn();
      const fsm = build(() => false, update);

      fsm.on("idle", "GO", action);
      fsm.onTransition(listener);

      // Every observable of a refusal, side by side with the undeclared case.
      expect(fsm.send("GO", { token: 1 })).toBe("idle");
      expect(fsm.getState()).toBe("idle");
      expect(fsm.canSend("GO", { token: 1 })).toBe(false);
      expect(update).not.toHaveBeenCalled();
      expect(action).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();

      // …and the undeclared event from the same state behaves identically.
      expect(fsm.send("STOP")).toBe("idle");
      expect(fsm.canSend("STOP")).toBe(false);
    });

    it("§13.1-2 canSend/send parity — the ask agrees with what the fire would do", () => {
      const evenOnly = (_ctx: Ctx, p: { token: number } | undefined) =>
        p !== undefined && p.token % 2 === 0;

      const asked = build(evenOnly);
      const fired = build(evenOnly);

      for (const token of [1, 2]) {
        const verdict = asked.canSend("GO", { token });
        const moved = fired.send("GO", { token }) === "busy";

        expect(verdict).toBe(moved);
      }
    });

    it("§13.1-2 `when` is TOTAL over a missing payload — canSend(event) answers without one", () => {
      const fsm = build((_ctx, p) => p?.token === 1);

      // Payload-dependent conditions answer conservatively, they do not throw.
      expect(fsm.canSend("GO")).toBe(false);
      expect(fsm.canSend("GO", { token: 1 })).toBe(true);
    });

    it("§13.1-3 dispatch order — when(before swap) → swap → update → action → listeners", () => {
      const order: string[] = [];
      const fsm = new FSM<S, E, Ctx, P>({
        initial: "idle",
        context: { epoch: 0, log: [] },
        transitions: {
          idle: {
            GO: {
              target: "busy",
              when: (ctx) => {
                order.push(`when:${ctx.epoch}`);

                return true;
              },
              update: (ctx) => {
                ctx.epoch++;
                order.push("update");
              },
            },
          },
          busy: {},
        },
      });

      fsm.on("idle", "GO", () => {
        order.push(`action:${fsm.getState()}`);
      });
      fsm.onTransition(() => {
        order.push("listener");
      });

      fsm.send("GO", { token: 1 });

      expect(order).toStrictEqual([
        "when:0",
        "update",
        "action:busy",
        "listener",
      ]);
      expect(fsm.getContext().epoch).toBe(1);
    });

    it("§13.1-3 `update` runs exactly once per fired transition, and never on a refusal", () => {
      const update = vi.fn();
      const fsm = build((_ctx, p) => p?.token === 1, update);

      fsm.send("GO", { token: 0 });

      expect(update).not.toHaveBeenCalled();

      fsm.send("GO", { token: 1 });

      expect(update).toHaveBeenCalledTimes(1);
    });

    it("§13.1-4 `when` purity — a throwing condition leaves the state UNCHANGED", () => {
      const boom = new Error("condition blew up");
      const fsm = build(() => {
        throw boom;
      });

      expect(() => fsm.send("GO", { token: 1 })).toThrow(boom);
      // Contrast with m6: an action/listener throw escapes with the state ALREADY new.
      expect(fsm.getState()).toBe("idle");
    });

    it("§13.1-5 closure validation — an object-form target must be declared", () => {
      expect(
        () =>
          new FSM<string, string, null>({
            initial: "a",
            context: null,
            transitions: { a: { go: { target: "GHOST" } }, b: {} },
          }),
      ).toThrow(
        '[FSM.constructor] state "GHOST" is not declared in config.transitions',
      );
    });

    it("§13.1-5 closure validation — `when` must be a function", () => {
      expect(
        () =>
          new FSM<string, string, null>({
            initial: "a",
            context: null,
            transitions: {
              a: {
                go: { target: "a", when: "nope" as unknown as () => boolean },
              },
            },
          }),
      ).toThrow(
        '[FSM.constructor] transitions["a"]["go"].when is not a function',
      );
    });

    it("§13.1-5 closure validation — `update` must be a function", () => {
      expect(
        () =>
          new FSM<string, string, null>({
            initial: "a",
            context: null,
            transitions: {
              a: { go: { target: "a", update: 42 as unknown as () => void } },
            },
          }),
      ).toThrow(
        '[FSM.constructor] transitions["a"]["go"].update is not a function',
      );
    });

    it("§13.1-6 context ownership — the engine never writes ctx outside `update`", () => {
      const ctx = { epoch: 0, log: [] as string[] };
      const fsm = new FSM<S, E, Ctx, P>({
        initial: "idle",
        context: ctx,
        transitions: { idle: { GO: "busy" }, busy: { STOP: "idle" } },
      });

      fsm.send("GO", { token: 1 });
      fsm.send("STOP");

      // Same reference, untouched: no update declared anywhere in this table.
      expect(fsm.getContext()).toBe(ctx);
      expect(ctx).toStrictEqual({ epoch: 0, log: [] });
    });

    it("§13.1-7 pre-normalisation is NEUTRAL — the string form and its object twin are indistinguishable", () => {
      const trace = (
        f: FSM<string, string, null>,
        events: string[],
      ): string[] => {
        const seen: string[] = [];

        f.onTransition((info) => {
          seen.push(`${info.from}->${info.to}`);
        });

        for (const event of events) {
          seen.push(
            `send:${event}=${f.send(event)}`,
            `can:${event}=${String(f.canSend(event))}`,
          );
        }

        return seen;
      };

      const events = ["go", "back", "nope"];
      const asString = new FSM<string, string, null>({
        initial: "a",
        context: null,
        transitions: { a: { go: "b" }, b: { back: "a" } },
      });
      const asObject = new FSM<string, string, null>({
        initial: "a",
        context: null,
        transitions: {
          a: { go: { target: "b" } },
          b: { back: { target: "a" } },
        },
      });

      expect(trace(asObject, events)).toStrictEqual(trace(asString, events));
    });

    it("§13.1-7 the normalisation cache is per TABLE, never per context", () => {
      // Two machines over ONE shared table object: the normalised edges may be
      // shared, the contexts must NOT be — otherwise SSR clones would glue.
      const shared: TransitionTable<"a", "go", Ctx, Record<never, never>> = {
        a: {
          go: {
            target: "a",
            update: (c: Ctx) => {
              c.epoch++;
            },
          },
        },
      };
      const first = new FSM<"a", "go", Ctx>({
        initial: "a",
        context: { epoch: 0, log: [] },
        transitions: shared,
      });
      const second = new FSM<"a", "go", Ctx>({
        initial: "a",
        context: { epoch: 0, log: [] },
        transitions: shared,
      });

      first.send("go");
      first.send("go");

      expect(first.getContext().epoch).toBe(2);
      expect(second.getContext().epoch).toBe(0);
      expect(first.getContext()).not.toBe(second.getContext());
    });
  });
});

// The dispatch pair carries its payload POSITIONALLY at runtime while keeping
// the conditional rest tuple in its overload — see the comment on `send`. This
// pins the half that has no other guard: types are held by the
// `@ts-expect-error` assertions above, and the allocation is held by nothing
// unless it is stated structurally.
//
// A rest parameter here is a per-call array on the router's hottest entry
// point. Measured before it was removed: -88 B per navigation on the alloc
// probe (window 200, median of 31, A/A floor 0), with the p90 tail collapsing
// from 2384 to 2133 B. Timing was a wash (733 vs 734 ns), so this is purely a
// GC-pressure win and a number in a benchmark would not hold it.
describe("dispatch signatures allocate no rest array", () => {
  const source = ts.createSourceFile(
    "fsm.ts",
    readFileSync(
      path.resolve(__dirname, "../../../../src/utils/fsm/fsm.ts"),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  /** The IMPLEMENTATION signature — the overload declarations have no body. */
  const implementationOf = (name: string): ts.MethodDeclaration => {
    const found: ts.MethodDeclaration[] = [];

    const visit = (node: ts.Node): void => {
      if (
        ts.isMethodDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === name &&
        node.body !== undefined
      ) {
        found.push(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);

    expect(found).toHaveLength(1);

    return found[0];
  };

  it.each(["send", "canSend"])(
    "%s takes its payload positionally",
    (method) => {
      const params = implementationOf(method).parameters;

      expect(params.some((p) => p.dotDotDotToken !== undefined)).toBe(false);
      expect(params).toHaveLength(2);
    },
  );

  it("the correlated tuple survives in the overload — both halves, or neither", () => {
    // Without this the previous assertion is satisfiable by deleting the
    // overload, which would silently retire the #753 payload correlation.
    const overloads: ts.MethodDeclaration[] = [];

    const visit = (node: ts.Node): void => {
      if (
        ts.isMethodDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        (node.name.text === "send" || node.name.text === "canSend") &&
        node.body === undefined
      ) {
        overloads.push(node);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);

    expect(overloads).toHaveLength(2);

    for (const overload of overloads) {
      expect(
        overload.parameters.some((p) => p.dotDotDotToken !== undefined),
      ).toBe(true);
    }
  });
});

describe("the table and `initial` are each read once (#1930)", () => {
  /**
   * ⚑ The read COUNT is the property, not the outcome. `normalizeEdge` validated
   * `when` / `update` and then stored a SECOND read of the same slot, and the
   * constructor read `initial` for `#state`, for the declaredness check and for
   * `#currentTransitions` — and that pair IS the machine, so a slot answering
   * differently between the two writes leaves `getState()` reporting one row
   * while `canSend` answers another's.
   */
  const countingEdge = (): {
    edge: Record<string, unknown>;
    reads: Record<string, number>;
  } => {
    const reads: Record<string, number> = {};
    const source: Record<string, unknown> = {
      target: "B",
      when: () => true,
      update: (ctx: unknown) => ctx,
    };
    const edge = {};

    for (const key of ["target", "when", "update"]) {
      Object.defineProperty(edge, key, {
        enumerable: true,
        configurable: true,
        get(): unknown {
          reads[key] = (reads[key] ?? 0) + 1;

          return source[key];
        },
      });
    }

    return { edge, reads };
  };

  it("reads each edge slot once, and `initial` once", () => {
    const { edge, reads } = countingEdge();
    let initialReads = 0;
    const config = {
      get initial(): string {
        initialReads += 1;

        return "A";
      },
      transitions: { A: { GO: edge }, B: {} },
    };

    const machine = new FSM(config as never);

    expect({
      target: reads.target ?? 0,
      when: reads.when ?? 0,
      update: reads.update ?? 0,
      initial: initialReads,
    }).toStrictEqual({ target: 1, when: 1, update: 1, initial: 1 });

    // CONTROL — the machine really was built from that declaration, so the
    // counts above are of a live table rather than of nothing.
    expect(machine.getState()).toBe("A");
    expect(
      (machine as unknown as { canSend: (event: string) => boolean }).canSend(
        "GO",
      ),
    ).toBe(true);
  });

  it("CONTROL — the validation those reads serve still refuses a non-function", () => {
    expect(
      () =>
        new FSM({
          initial: "A",
          transitions: { A: { GO: { target: "B", when: 42 } }, B: {} },
        } as never),
    ).toThrow(/when is not a function/);

    expect(
      () =>
        new FSM({
          initial: "A",
          transitions: { A: { GO: { target: "B", update: 42 } }, B: {} },
        } as never),
    ).toThrow(/update is not a function/);

    expect(
      () => new FSM({ initial: "NOPE", transitions: { A: {} } } as never),
    ).toThrow(/is not declared in config.transitions/);
  });
});
