import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbFSMConfig,
  arbGuardedFSMConfig,
  arbFSMConfigWithInitialTransition,
  arbFSMConfigWithSelfLoop,
  arbFSMConfigWithTwoStepChain,
  arbEventSequence,
  arbMixedEventSequence,
  createFSM,
  createFSMWithPayloads,
  newCounterContext,
} from "./helpers";
import { FSM } from "../../../../src/utils/fsm/index.js";

import type { TransitionTable } from "../../../../src/utils/fsm/index.js";

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

describe("FSM Action Exception Properties", () => {
  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })(
    "action exception propagates through send() and state is updated",
    (gen) => {
      const fsm = createFSM(gen);

      fsm.on(gen.config.initial, gen.knownEvent, () => {
        throw new Error("action error");
      });

      expect(() => fsm.send(gen.knownEvent)).toThrow("action error");
      // State should be updated even though action threw
      expect(fsm.getState()).toBe(gen.knownTo);
    },
  );
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
      // `TransitionTable` is INVARIANT in TContext — conditions and updates take
      // the context in a parameter position — so a table generated for `null`
      // needs a cast to be reused under another context type (RFC-10a §9).
      const fsm = new FSM<string, string, typeof context>({
        initial: gen.config.initial,
        context,
        transitions: gen.config.transitions as unknown as TransitionTable<
          string,
          string,
          typeof context,
          Record<never, never>
        >,
      });

      expect(fsm.getContext()).toBe(context);
    },
  );
});

// --- Hardening properties: payload delivery (#753), declared-state guard
// --- (#885), and reentrancy / live iteration (#755). ---

describe("FSM Payload Delivery Properties", () => {
  test.prop(
    [
      arbFSMConfigWithInitialTransition.chain((gen) =>
        fc.tuple(fc.constant(gen), fc.anything()),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "send(event, payload) delivers the same payload to the action and to TransitionInfo.payload",
    ([gen, payload]) => {
      const fsm = createFSMWithPayloads(gen);
      let actionCalled = false;
      let actionPayload: unknown;
      let infoPayload: unknown;

      fsm.on(gen.config.initial, gen.knownEvent, (p) => {
        actionCalled = true;
        actionPayload = p;
      });
      fsm.onTransition((info) => {
        infoPayload = info.payload;
      });

      fsm.send(gen.knownEvent, payload);

      expect(actionCalled).toBe(true);
      expect(actionPayload).toBe(payload);
      expect(infoPayload).toBe(payload);
    },
  );
});

describe("FSM Reentrancy & Live-Iteration Properties", () => {
  test.prop([arbFSMConfigWithTwoStepChain], { numRuns: NUM_RUNS.lifecycle })(
    "outer listener sees its own info.to while getState() reflects the reentrant final state",
    (gen) => {
      const fsm = createFSM(gen);
      let firstCall = true;
      let outerInfoTo: string | undefined;
      let stateAtOuterReturn: string | undefined;

      fsm.onTransition((info) => {
        if (firstCall) {
          firstCall = false;
          fsm.send(gen.secondEvent); // reentrant: knownTo -> secondTo
          outerInfoTo = info.to;
          stateAtOuterReturn = fsm.getState();
        }
      });

      fsm.send(gen.knownEvent); // initial -> knownTo

      expect(outerInfoTo).toBe(gen.knownTo);
      expect(stateAtOuterReturn).toBe(gen.secondTo);
      expect(outerInfoTo).not.toBe(stateAtOuterReturn);
      expect(fsm.getState()).toBe(gen.secondTo);
    },
  );

  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })(
    "a listener added during a send fires within that same send (live iteration, no snapshot)",
    (gen) => {
      const fsm = createFSM(gen);
      const log: string[] = [];
      let added = false;

      fsm.onTransition(() => {
        log.push("A");
        if (!added) {
          added = true;
          fsm.onTransition(() => log.push("B"));
        }
      });

      fsm.send(gen.knownEvent);

      expect(log).toStrictEqual(["A", "B"]);
    },
  );
});

describe("FSM Listener Churn Properties", () => {
  test.prop(
    [
      arbFSMConfigWithInitialTransition.chain((gen) =>
        fc.tuple(
          fc.constant(gen),
          fc.array(fc.integer({ min: 0, max: 1000 }), {
            minLength: 1,
            maxLength: 40,
          }),
        ),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "after random subscribe/unsubscribe churn, exactly the live listeners fire in slot order",
    ([gen, codes]) => {
      const fsm = createFSM(gen);
      const fireLog: number[] = [];
      const live: { id: number; unsub: () => void }[] = [];
      const model: (number | null)[] = []; // mirrors the FSM's null-slot array
      let nextId = 0;

      for (const code of codes) {
        if (code % 2 === 0 || live.length === 0) {
          const id = nextId++;
          const unsub = fsm.onTransition(() => fireLog.push(id));

          live.push({ id, unsub });

          const nullIdx = model.indexOf(null);

          if (nullIdx === -1) {
            model.push(id);
          } else {
            model[nullIdx] = id;
          }
        } else {
          const target = live[code % live.length];

          target.unsub();
          live.splice(code % live.length, 1);
          model[model.indexOf(target.id)] = null;
        }
      }

      fireLog.length = 0;
      fsm.send(gen.knownEvent);

      const expected = model.filter((x): x is number => x !== null);

      expect(fireLog).toStrictEqual(expected);
    },
  );
});

describe("FSM Action Hardening Properties", () => {
  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })(
    "unsubscribing an overwritten action does not remove its replacement",
    (gen) => {
      const fsm = createFSM(gen);
      let aCalled = false;
      let bCalled = false;

      const unsubA = fsm.on(gen.config.initial, gen.knownEvent, () => {
        aCalled = true;
      });

      fsm.on(gen.config.initial, gen.knownEvent, () => {
        bCalled = true;
      });

      unsubA(); // no-op: A was already replaced by B

      fsm.send(gen.knownEvent);

      expect(aCalled).toBe(false);
      expect(bCalled).toBe(true);
    },
  );

  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )(
    "multiple actions on distinct (from, event) pairs each fire exactly on their matching transition",
    ([gen, events]) => {
      const fsm = createFSM(gen);
      const actual = new Map<string, number>();
      const expected = new Map<string, number>();

      for (const state of gen.states) {
        for (const event of gen.events) {
          if (gen.config.transitions[state][event] !== undefined) {
            const key = `${state}|${event}`;

            fsm.on(state, event, () => {
              actual.set(key, (actual.get(key) ?? 0) + 1);
            });
          }
        }
      }

      for (const event of events) {
        const from = fsm.getState();

        if (gen.config.transitions[from][event] !== undefined) {
          const key = `${from}|${event}`;

          expected.set(key, (expected.get(key) ?? 0) + 1);
        }

        fsm.send(event);
      }

      expect(actual).toStrictEqual(expected);
    },
  );

  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })(
    "when an action throws, onTransition listeners are not reached (action runs first, no isolation)",
    (gen) => {
      const fsm = createFSM(gen);
      let listenerCalled = false;

      fsm.on(gen.config.initial, gen.knownEvent, () => {
        throw new Error("action boom");
      });
      fsm.onTransition(() => {
        listenerCalled = true;
      });

      expect(() => fsm.send(gen.knownEvent)).toThrow("action boom");
      expect(listenerCalled).toBe(false);
      expect(fsm.getState()).toBe(gen.knownTo);
    },
  );
});

describe("FSM Listener Exception Properties", () => {
  test.prop([arbFSMConfigWithInitialTransition], {
    numRuns: NUM_RUNS.lifecycle,
  })(
    "a throwing listener aborts the dispatch — listeners registered after it are skipped",
    (gen) => {
      const fsm = createFSM(gen);
      const log: string[] = [];

      fsm.onTransition(() => log.push("first"));
      fsm.onTransition(() => {
        throw new Error("listener boom");
      });
      fsm.onTransition(() => log.push("third"));

      expect(() => fsm.send(gen.knownEvent)).toThrow("listener boom");
      expect(log).toStrictEqual(["first"]);
      expect(fsm.getState()).toBe(gen.knownTo);
    },
  );
});

describe("FSM Robustness Properties", () => {
  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(
          fc.constant(gen),
          fc.array(fc.constantFrom(...(gen.events as [string, ...string[]])), {
            minLength: 1,
            maxLength: 30,
          }),
        ),
      ),
    ],
    { numRuns: NUM_RUNS.lifecycle },
  )("no sequence of send ever bricks the FSM", ([gen, events]) => {
    const fsm = createFSM(gen);

    for (const event of events) {
      fsm.send(event);

      // After every send the FSM stays consistent: the state is declared and
      // canSend never throws (i.e. #currentTransitions is never undefined).
      expect(gen.states).toContain(fsm.getState());

      for (const evt of gen.events) {
        expect(typeof fsm.canSend(evt)).toBe("boolean");
      }
    }
  });
});

describe("FSM Declared-State Guard Properties", () => {
  test.prop(
    [
      arbFSMConfig.chain((gen) =>
        fc.tuple(
          fc.constant(gen),
          fc
            .string({ minLength: 1, maxLength: 5 })
            .filter((s) => !gen.states.includes(s)),
        ),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "constructor and on both reject an undeclared state (#885)",
    ([gen, undeclaredState]) => {
      // constructor's `initial`
      expect(
        () => new FSM({ ...gen.config, initial: undeclaredState }),
      ).toThrow("is not declared in config.transitions");

      const fsm = createFSM(gen);

      // on's `from`
      expect(() => {
        fsm.on(undeclaredState, gen.events[0], () => {});
      }).toThrow("is not declared in config.transitions");
    },
  );

  test.prop(
    [
      arbFSMConfigWithInitialTransition.chain((gen) =>
        fc.tuple(
          fc.constant(gen),
          fc
            .string({ minLength: 1, maxLength: 5 })
            .filter((s) => !gen.states.includes(s)),
        ),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "constructor rejects a dangling transition target (#1159)",
    ([gen, danglingTarget]) => {
      // The 4th state-entry-point. Replace one declared target with a string
      // outside the state universe — the exact input `arbFSMConfig` cannot
      // generate (its targets are state indices), so this closes the generator
      // blindness that let the brick stay green while the code contradicted
      // Validity #1 / No-bricking #10.
      const brokenTransitions = {
        ...gen.config.transitions,
        [gen.config.initial]: {
          ...gen.config.transitions[gen.config.initial],
          [gen.knownEvent]: danglingTarget,
        },
      };

      expect(
        () => new FSM({ ...gen.config, transitions: brokenTransitions }),
      ).toThrow("is not declared in config.transitions");
    },
  );
});

/**
 * Guarded edges (`when`) and context updates (`update`) — RFC-10a §13.1, #1646.
 *
 * S1 gave the engine these two and the property tier never saw them:
 * `arbFSMConfig` generates bare-string edges only, so every invariant below was
 * held by hand-written functional cases and by nothing generative. The gap is
 * not cosmetic — the guarded form is what the router's cancellation semantics
 * are built on (`mayCommit`, `isOwnEpoch`), and the string form cannot exercise
 * the ordering contract at all.
 *
 * `arbGuardedFSMConfig` is a SIBLING of `arbFSMConfig`, not a widening of it: a
 * refused `when` is observationally identical to an undeclared event, so mixing
 * the two axes would quietly change what the existing "Rejection" and "canSend
 * correlation" properties are about.
 */
describe("FSM Guarded-Edge Properties", () => {
  test.prop(
    [
      arbGuardedFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "pre-normalisation is neutral: with every `when` allowed, the mixed table and its bare-string twin are indistinguishable",
    ([gen, events]) => {
      const mixed = new FSM({ ...gen.config, context: newCounterContext() });
      const twin = new FSM({ ...gen.stringTwin, context: newCounterContext() });
      const mixedLog: string[] = [];
      const twinLog: string[] = [];

      mixed.onTransition((info) => mixedLog.push(`${info.from}>${info.to}`));
      twin.onTransition((info) => twinLog.push(`${info.from}>${info.to}`));

      for (const event of events) {
        // `allow: true` so no generated condition refuses — the only difference
        // left between the two tables is the SHAPE the normaliser widens.
        mixed.send(event, { allow: true });
        twin.send(event, { allow: true });
      }

      expect(mixed.getState()).toBe(twin.getState());
      expect(mixedLog).toStrictEqual(twinLog);
    },
  );

  test.prop(
    [
      arbGuardedFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "a refused `when` blocks the swap AND its update, and notifies nobody",
    ([gen, events]) => {
      const fsm = new FSM({ ...gen.config, context: newCounterContext() });
      let notified = 0;

      fsm.onTransition(() => {
        notified++;
      });

      for (const event of events) {
        const before = fsm.getState();
        const firedBefore = fsm.getContext().fired;
        const notifiedBefore = notified;
        const guarded = gen.guardedEdges.has(`${before}|${event}`);

        // Every generated `when` reads `payload.allow`, so this refuses each
        // guarded edge and leaves every other edge to the table.
        const after = fsm.send(event, { allow: false });

        if (guarded) {
          // All four observables at once — that IS the equivalence claim.
          expect(after).toBe(before);
          expect(fsm.getState()).toBe(before);
          expect(fsm.getContext().fired).toBe(firedBefore);
          expect(notified).toBe(notifiedBefore);
        }
      }
    },
  );

  test.prop(
    [
      arbGuardedFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "`update` runs exactly once per fired transition that carries one",
    ([gen, events]) => {
      const fsm = new FSM({ ...gen.config, context: newCounterContext() });
      let expected = 0;

      for (const event of events) {
        const from = fsm.getState();

        // `allow: true` fires every declared edge, guarded or not, so an edge
        // carrying an `update` runs it exactly once — no more, no fewer.
        fsm.send(event, { allow: true });

        if (gen.updatingEdges.has(`${from}|${event}`)) {
          expected++;
        }
      }

      expect(fsm.getContext().fired).toBe(expected);
    },
  );

  test.prop(
    [
      arbGuardedFSMConfig.chain((gen) =>
        fc.tuple(fc.constant(gen), arbEventSequence(gen.events)),
      ),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "canSend correlates with send BOTH ways when both are asked with the same payload",
    ([gen, events]) => {
      const fsm = new FSM({ ...gen.config, context: newCounterContext() });

      for (const event of events) {
        for (const allow of [true, false]) {
          const before = fsm.getState();
          const predicted = fsm.canSend(event, { allow });

          // The discriminator is a LISTENER, not `after !== before`: a self-loop
          // fires without moving the state, so reading the identity off the
          // state alone would make the `true` direction vacuous — and it is the
          // `true` direction that dies when `canSend` stops consulting `when`
          // (mutationally checked: asserting only the `false` branch leaves that
          // mutant alive, which is the very defect #1646 is about).
          let fired = false;
          const unsub = fsm.onTransition(() => {
            fired = true;
          });
          const after = fsm.send(event, { allow });

          unsub();

          expect(fired).toBe(predicted);

          if (!predicted) {
            expect(after).toBe(before);
            expect(fsm.getState()).toBe(before);
          }
        }
      }
    },
  );
});
