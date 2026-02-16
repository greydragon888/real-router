import { bench, do_not_optimize } from "mitata";

import { FSM } from "../../src/fsm";

import type { FSMConfig } from "../../src/types";

// ============================================================================
// Configs (pre-made outside bench blocks)
// ============================================================================

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

type TwoState = "a" | "b";
type TwoEvent = "TOGGLE";

const twoStateConfig: FSMConfig<TwoState, TwoEvent, null> = {
  initial: "a",
  context: null,
  transitions: {
    a: { TOGGLE: "b" },
    b: { TOGGLE: "a" },
  },
};

type PayloadState = "idle" | "loading";
type PayloadEvent = "FETCH" | "DONE";
interface PayloadMap {
  FETCH: { url: string };
}

const payloadConfig: FSMConfig<PayloadState, PayloadEvent, null> = {
  initial: "idle",
  context: null,
  transitions: {
    idle: { FETCH: "loading" },
    loading: { DONE: "idle" },
  },
};

// Large FSM: 50 states, ring topology (state0 → state1 → ... → state49 → state0)
type RingState = `state${number}`;
type RingEvent = "NEXT";

function createRingConfig(size: number): FSMConfig<RingState, RingEvent, null> {
  const transitions: Record<string, Partial<Record<RingEvent, RingState>>> = {};

  for (let i = 0; i < size; i++) {
    transitions[`state${i}`] = { NEXT: `state${(i + 1) % size}` };
  }

  return {
    initial: "state0" as RingState,
    context: null,
    transitions: transitions as Record<
      RingState,
      Partial<Record<RingEvent, RingState>>
    >,
  };
}

const ringConfig = createRingConfig(50);

// Self-transition config
type SelfState = "on";
type SelfEvent = "PING";

const selfConfig: FSMConfig<SelfState, SelfEvent, null> = {
  initial: "on",
  context: null,
  transitions: {
    on: { PING: "on" },
  },
};

// ============================================================================
// Section 1: Basic Scenarios
// ============================================================================

// 1.1 FSM construction (traffic light config)
bench("1.1 FSM construction", () => {
  do_not_optimize(new FSM(lightConfig));
}).gc("inner");

// 1.2 send() with valid transition, 0 listeners (hot path: no allocation)
{
  const fsm = new FSM(twoStateConfig);

  bench("1.2 send() valid transition, 0 listeners", () => {
    do_not_optimize(fsm.send("TOGGLE"));
  }).gc("inner");
}

// 1.3 send() no-op (unknown event for current state)
{
  const fsm = new FSM(lightConfig);

  bench("1.3 send() no-op (unknown event)", () => {
    do_not_optimize(fsm.send("RESET"));
  }).gc("inner");
}

// 1.4 send() with 1 listener
{
  const fsm = new FSM(twoStateConfig);

  fsm.onTransition(() => {});

  bench("1.4 send() with 1 listener", () => {
    do_not_optimize(fsm.send("TOGGLE"));
  }).gc("inner");
}

// 1.5 send() with 3 listeners
{
  const fsm = new FSM(twoStateConfig);

  fsm.onTransition(() => {});
  fsm.onTransition(() => {});
  fsm.onTransition(() => {});

  bench("1.5 send() with 3 listeners", () => {
    do_not_optimize(fsm.send("TOGGLE"));
  }).gc("inner");
}

// 1.6 send() with payload
{
  const fsm = new FSM<PayloadState, PayloadEvent, null, PayloadMap>(
    payloadConfig,
  );

  bench("1.6 send() with payload", () => {
    fsm.send("FETCH", { url: "https://example.com" });
    do_not_optimize(fsm.send("DONE"));
  }).gc("inner");
}

// 1.7 getState()
{
  const fsm = new FSM(lightConfig);

  bench("1.7 getState()", () => {
    do_not_optimize(fsm.getState());
  }).gc("inner");
}

// 1.8 getContext()
{
  const fsm = new FSM(lightConfig);

  bench("1.8 getContext()", () => {
    do_not_optimize(fsm.getContext());
  }).gc("inner");
}

// 1.9 onTransition subscribe + unsubscribe (accumulating → fallback pattern)
{
  const fsm = new FSM(lightConfig);
  const listener = () => {};

  bench("1.9 onTransition subscribe + unsubscribe", () => {
    const unsub = fsm.onTransition(listener);

    do_not_optimize(unsub);
    unsub();
  }).gc("inner");
}

// 1.10 Cyclic transitions: green→yellow→red→green (×1000)
{
  const fsm = new FSM(lightConfig);

  bench("1.10 Cyclic transitions x1000", () => {
    for (let i = 0; i < 1000; i++) {
      fsm.send("TIMER");
    }
  }).gc("inner");
}

// 1.11 Self-transition (from === to)
{
  const fsm = new FSM(selfConfig);

  bench("1.11 Self-transition", () => {
    do_not_optimize(fsm.send("PING"));
  }).gc("inner");
}

// ============================================================================
// Section 2: Stress Tests
// ============================================================================

// 2.1 1000 sequential alternating transitions (2 states)
{
  const fsm = new FSM(twoStateConfig);

  bench("2.1 1000 alternating transitions (2 states)", () => {
    for (let i = 0; i < 1000; i++) {
      fsm.send("TOGGLE");
    }
  }).gc("inner");
}

// 2.2 10000 sequential transitions across 3 states
{
  const fsm = new FSM(lightConfig);

  bench("2.2 10000 transitions across 3 states", () => {
    for (let i = 0; i < 10_000; i++) {
      fsm.send("TIMER");
    }
  }).gc("inner");
}

// 2.3 send() dispatch with 100 listeners
{
  const fsm = new FSM(twoStateConfig);

  for (let i = 0; i < 100; i++) {
    fsm.onTransition(() => {});
  }

  bench("2.3 send() with 100 listeners", () => {
    do_not_optimize(fsm.send("TOGGLE"));
  }).gc("inner");
}

// 2.4 send() dispatch with 1000 listeners
{
  const fsm = new FSM(twoStateConfig);

  for (let i = 0; i < 1000; i++) {
    fsm.onTransition(() => {});
  }

  bench("2.4 send() with 1000 listeners", () => {
    do_not_optimize(fsm.send("TOGGLE"));
  }).gc("inner");
}

// 2.5 1000 subscribe/unsubscribe cycles (null-slot reuse verification)
{
  const fsm = new FSM(lightConfig);
  const listener = () => {};

  bench("2.5 1000 subscribe/unsubscribe cycles", () => {
    for (let i = 0; i < 1000; i++) {
      const unsub = fsm.onTransition(listener);

      unsub();
    }
  }).gc("inner");
}

// 2.6 Large FSM: 50 states, ring topology, 1000 transitions
{
  const fsm = new FSM(ringConfig);

  bench("2.6 Large FSM ring (50 states) x1000", () => {
    for (let i = 0; i < 1000; i++) {
      fsm.send("NEXT");
    }
  }).gc("inner");
}

// 2.7 Reentrancy: send() inside listener, 1000 outer transitions
{
  const fsm = new FSM(twoStateConfig);
  let reentrantCount = 0;

  fsm.onTransition(() => {
    if (reentrantCount < 1) {
      reentrantCount++;
      fsm.send("TOGGLE");
      reentrantCount--;
    }
  });

  bench("2.7 Reentrant send() x1000", () => {
    for (let i = 0; i < 1000; i++) {
      fsm.send("TOGGLE");
    }
  }).gc("inner");
}

// 2.8 Mixed workload: transitions + getState + getContext interleaved (×1000)
{
  const fsm = new FSM(lightConfig);

  bench("2.8 Mixed workload x1000", () => {
    for (let i = 0; i < 1000; i++) {
      fsm.send("TIMER");
      do_not_optimize(fsm.getState());
      do_not_optimize(fsm.getContext());
    }
  }).gc("inner");
}
