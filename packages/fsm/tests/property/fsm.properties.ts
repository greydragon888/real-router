import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { FSM } from "@real-router/fsm";

import {
  NUM_RUNS,
  arbFSMConfig,
  arbFSMConfigWithInitialTransition,
  arbFSMConfigWithSelfLoop,
  arbEventSequence,
  arbMixedEventSequence,
  createFSM,
} from "./helpers";

describe("FSM State Transition Properties", () => {
  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("state is always a member of the configured states", ([gen, events]) => {
    const fsm = createFSM(gen);

    for (const event of events) {
      fsm.send(event);

      expect(gen.states).toContain(fsm.getState());
    }
  });

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "same event sequence always produces the same final state",
    ([gen, events]) => {
      const fsm1 = createFSM(gen);
      const fsm2 = createFSM(gen);

      for (const event of events) {
        fsm1.send(event);
        fsm2.send(event);
      }

      expect(fsm1.getState()).toStrictEqual(fsm2.getState());
    },
  );

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(
          fc.constant(gen),
          fc
            .string({ minLength: 1, maxLength: 5 })
            .filter((s) => !gen.events.includes(s)),
        ),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )("event not in the event set never changes state", ([gen, invalidEvent]) => {
    const fsm = createFSM(gen);
    const stateBefore = fsm.getState();

    fsm.send(invalidEvent);

    expect(fsm.getState()).toStrictEqual(stateBefore);
  });

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbMixedEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "canSend accurately predicts whether a transition will fire",
    ([gen, events]) => {
      const fsm = createFSM(gen);

      for (const event of events) {
        const canSendResult = fsm.canSend(event);
        let listenerCalled = false;
        const unsub = fsm.onTransition(() => {
          listenerCalled = true;
        });
        const stateBefore = fsm.getState();

        fsm.send(event);
        unsub();

        if (canSendResult) {
          expect(listenerCalled).toBe(true);
        } else {
          expect(fsm.getState()).toStrictEqual(stateBefore);
          expect(listenerCalled).toBe(false);
        }
      }
    },
  );

  test.prop([arbFSMConfig], { numRuns: NUM_RUNS.standard })(
    "getState() returns config.initial immediately after construction",
    (gen) => {
      const fsm = createFSM(gen);

      expect(fsm.getState()).toStrictEqual(gen.config.initial);
    },
  );
});

describe("FSM Listener Properties", () => {
  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
      fc.integer({ min: 2, max: 5 }),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "listeners registered without intermediate unsubscribes are called in registration order",
    ([gen, events], numListeners) => {
      const fsm = createFSM(gen);
      const order: number[] = [];

      for (let i = 0; i < numListeners; i++) {
        const idx = i;

        fsm.onTransition(() => order.push(idx));
      }

      for (const event of events) {
        if (fsm.canSend(event)) {
          fsm.send(event);

          expect(order).toStrictEqual(
            Array.from({ length: numListeners }, (_, i) => i),
          );

          return;
        }
      }
    },
  );

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )("unsubscribed listener is never called", ([gen, events]) => {
    const fsm = createFSM(gen);
    let called = false;
    const unsub = fsm.onTransition(() => {
      called = true;
    });

    unsub();

    for (const event of events) {
      fsm.send(event);
    }

    expect(called).toBe(false);
  });

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
      fc.integer({ min: 1, max: 5 }),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "after unsubscribing all listeners none are called",
    ([gen, events], numListeners) => {
      const fsm = createFSM(gen);
      const calls: number[] = [];
      const unsubs: (() => void)[] = [];

      for (let i = 0; i < numListeners; i++) {
        const idx = i;

        unsubs.push(fsm.onTransition(() => calls.push(idx)));
      }

      for (const unsub of unsubs) {
        unsub();
      }

      for (const event of events) {
        fsm.send(event);
      }

      expect(calls).toStrictEqual([]);
    },
  );

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )("send() inside a listener does not corrupt FSM state", ([gen, events]) => {
    const fsm = createFSM(gen);
    let reentrantDone = false;

    fsm.onTransition(({ to }) => {
      if (!reentrantDone) {
        reentrantDone = true;
        const toTrans = gen.config.transitions[to];

        for (const availableEvent of Object.keys(toTrans)) {
          fsm.send(availableEvent);

          break;
        }
      }
    });

    for (const event of events) {
      fsm.send(event);
    }

    expect(gen.states).toContain(fsm.getState());
  });
});

describe("FSM Self-Loop Properties", () => {
  test.prop([arbFSMConfigWithSelfLoop], { numRuns: NUM_RUNS.lifecycle })(
    "fires listener but leaves state unchanged",
    (gen) => {
      const fsm = createFSM(gen);
      const initial = gen.config.initial;
      const captured: { from: string; to: string; event: string }[] = [];

      expect(fsm.getState()).toStrictEqual(initial);

      fsm.onTransition((info) => {
        captured.push({ from: info.from, to: info.to, event: info.event });
      });

      fsm.send(gen.selfLoopEvent);

      expect(fsm.getState()).toStrictEqual(initial);
      expect(captured).toHaveLength(1);
      expect(captured[0]).toStrictEqual({
        from: initial,
        to: initial,
        event: gen.selfLoopEvent,
      });
    },
  );
});

describe("FSM TransitionInfo Properties", () => {
  test.prop(
    [
      arbFSMConfigWithInitialTransition.filter(
        (gen) => gen.knownTo !== gen.config.initial,
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "onTransition receives correct from, to, and event for general transitions",
    (gen) => {
      const fsm = createFSM(gen);
      const captured: { from: string; to: string; event: string }[] = [];

      fsm.onTransition((info) => {
        captured.push({ from: info.from, to: info.to, event: info.event });
      });

      fsm.send(gen.knownEvent);

      expect(fsm.getState()).toStrictEqual(gen.knownTo);
      expect(captured).toHaveLength(1);
      expect(captured[0]).toStrictEqual({
        from: gen.config.initial,
        to: gen.knownTo,
        event: gen.knownEvent,
      });
    },
  );
});

describe("FSM Action Properties", () => {
  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })("on() action fires before onTransition listeners", (gen) => {
    const fsm = createFSM(gen);
    const order: string[] = [];

    fsm.on(gen.config.initial, gen.knownEvent, () => {
      order.push("action");
    });

    fsm.onTransition(() => {
      order.push("listener");
    });

    fsm.send(gen.knownEvent);

    expect(order).toStrictEqual(["action", "listener"]);
  });

  test.prop(
    [
      arbFSMConfigWithInitialTransition.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )("on() fires only for matching (from, event)", ([gen, events]) => {
    const fsm = createFSM(gen);
    const initial = gen.config.initial;
    let actionCalls = 0;
    let expectedCalls = 0;

    fsm.on(initial, gen.knownEvent, () => {
      actionCalls++;
    });

    for (const event of events) {
      const from = fsm.getState();

      if (from === initial && event === gen.knownEvent) {
        expectedCalls++;
      }

      fsm.send(event);
    }

    expect(actionCalls).toBe(expectedCalls);
  });

  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })("second on() for same (from, event) replaces the first", (gen) => {
    const fsm = createFSM(gen);
    let firstCalled = false;
    let secondCalled = false;

    fsm.on(gen.config.initial, gen.knownEvent, () => {
      firstCalled = true;
    });

    fsm.on(gen.config.initial, gen.knownEvent, () => {
      secondCalled = true;
    });

    fsm.send(gen.knownEvent);

    expect(firstCalled).toBe(false);
    expect(secondCalled).toBe(true);
  });

  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })("returned function removes the action", (gen) => {
    const fsm = createFSM(gen);
    let called = false;

    const unsub = fsm.on(gen.config.initial, gen.knownEvent, () => {
      called = true;
    });

    unsub();

    fsm.send(gen.knownEvent);

    expect(called).toBe(false);
  });
});

describe("FSM Edge Case Properties", () => {
  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })("double unsubscribe does not corrupt listener count", (gen) => {
    const fsm = createFSM(gen);
    let removedCalls = 0;
    let activeCalls = 0;

    const unsub = fsm.onTransition(() => {
      removedCalls++;
    });

    fsm.onTransition(() => {
      activeCalls++;
    });

    unsub();
    unsub();

    fsm.send(gen.knownEvent);

    expect(removedCalls).toBe(0);
    expect(activeCalls).toBe(1);
  });

  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })("state is updated even when listener throws", (gen) => {
    const fsm = createFSM(gen);

    fsm.onTransition(() => {
      throw new Error("boom");
    });

    expect(() => fsm.send(gen.knownEvent)).toThrow("boom");
    expect(fsm.getState()).toBe(gen.knownTo);
  });

  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })("new listener fills vacated slot and fires in that position", (gen) => {
    const fsm = createFSM(gen);
    const order: string[] = [];

    fsm.onTransition(() => order.push("A"));
    const unsubB = fsm.onTransition(() => order.push("B"));

    fsm.onTransition(() => order.push("C"));

    unsubB();

    fsm.onTransition(() => order.push("D"));

    fsm.send(gen.knownEvent);

    expect(order).toStrictEqual(["A", "D", "C"]);
  });

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "send() returns getState() even after reentrant send()",
    ([gen, events]) => {
      const fsm = createFSM(gen);
      let reentrantDone = false;

      fsm.onTransition(({ to }) => {
        if (!reentrantDone) {
          reentrantDone = true;
          const toTrans = gen.config.transitions[to];

          for (const availableEvent of Object.keys(toTrans)) {
            fsm.send(availableEvent);

            break;
          }
        }
      });

      for (const event of events) {
        const result = fsm.send(event);

        expect(result).toBe(fsm.getState());
      }
    },
  );

  test.prop(
    [arbFSMConfig, fc.record({ key: fc.string(), value: fc.integer() })],
    { numRuns: NUM_RUNS.standard },
  )(
    "getContext() returns the exact config.context reference",
    (gen, context) => {
      const fsm = new FSM({
        initial: gen.config.initial,
        context,
        transitions: gen.config.transitions,
      });

      expect(fsm.getContext()).toBe(context);
    },
  );
});
