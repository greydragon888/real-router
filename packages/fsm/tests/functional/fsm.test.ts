import { describe, it, expect, vi } from "vitest";

import { FSM } from "../../src/fsm.js";

import type { FSMConfig } from "../../src/types.js";

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

      expect(() => fsm.send("TIMER")).toThrowError(error);
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

      expect(true).toBe(true);
    });

    it("should reject payload for no-payload event", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      fsm.send("FETCH", { url: "/api" });

      // @ts-expect-error — RESOLVE does not accept payload
      fsm.send("RESOLVE", { data: "something" });

      expect(true).toBe(true);
    });

    it("should require payload for payload event", () => {
      const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
        payloadConfig,
      );

      // @ts-expect-error — FETCH requires payload
      fsm.send("FETCH");

      expect(true).toBe(true);
    });
  });
});
