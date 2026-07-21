import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  EVENT_NAMES,
  arbDistinctEventPair,
  arbData,
  arbEventName,
  arbListenerCount,
  arbMaxListeners,
  arbWarnThreshold,
  arbNonFunction,
  createOrderedListeners,
  createTestEmitter,
  createUniqueListeners,
  type TestEventMap,
  type EventName,
} from "./helpers";
import { EventEmitter } from "../../../../src/utils/event-emitter/EventEmitter.js";

describe("EventEmitter Property-Based Tests", () => {
  describe("delivery — all listeners receive emitted data", () => {
    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "every registered listener receives the emitted data exactly once",
      (eventName, listenerCount, data) => {
        const emitter = createTestEmitter();
        const listeners = createUniqueListeners(listenerCount);

        for (const { fn } of listeners) {
          emitter.on(eventName, fn);
        }

        emitter.emit(eventName, data);

        for (const { getCallCount, getLastData } of listeners) {
          expect(getCallCount()).toBe(1);
          expect(getLastData()).toBe(data);
        }
      },
    );
  });

  describe("ordering — listeners called in registration order", () => {
    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "listeners are invoked in registration order",
      (eventName, listenerCount, data) => {
        const emitter = createTestEmitter();
        const callOrder: number[] = [];
        const listeners = createOrderedListeners(listenerCount, callOrder);

        for (const fn of listeners) {
          emitter.on(eventName, fn);
        }

        emitter.emit(eventName, data);

        const expected = Array.from({ length: listenerCount }, (_, i) => i);

        expect(callOrder).toStrictEqual(expected);
      },
    );
  });

  describe("isolation — emit on event A does not call event B listeners", () => {
    test.prop([arbDistinctEventPair, arbData, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "emitting one event does not trigger listeners of a different event",
      ([eventA, eventB], dataA, dataB) => {
        const emitter = createTestEmitter();
        const [listenerA] = createUniqueListeners(1);
        const [listenerB] = createUniqueListeners(1);

        emitter.on(eventA, listenerA.fn);
        emitter.on(eventB, listenerB.fn);

        emitter.emit(eventA, dataA);

        expect(listenerA.getCallCount()).toBe(1);
        expect(listenerB.getCallCount()).toBe(0);

        emitter.emit(eventB, dataB);

        expect(listenerA.getCallCount()).toBe(1);
        expect(listenerB.getCallCount()).toBe(1);
      },
    );
  });

  describe("unsubscribe — listener not called after unsubscribe", () => {
    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "unsubscribed listener is not invoked on subsequent emits",
      (eventName, listenerCount, data) => {
        const emitter = createTestEmitter();
        const listeners = createUniqueListeners(listenerCount);
        const unsubs: (() => void)[] = [];

        for (const { fn } of listeners) {
          unsubs.push(emitter.on(eventName, fn));
        }

        for (const unsub of unsubs) {
          unsub();
        }

        emitter.emit(eventName, data);

        for (const { getCallCount } of listeners) {
          expect(getCallCount()).toBe(0);
        }

        expect(emitter.listenerCount(eventName)).toBe(0);
      },
    );

    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "off() removes listener and listenerCount decrements",
      (eventName, listenerCount, data) => {
        const emitter = createTestEmitter();
        const listeners = createUniqueListeners(listenerCount);

        for (const { fn } of listeners) {
          emitter.on(eventName, fn);
        }

        expect(emitter.listenerCount(eventName)).toBe(listenerCount);

        for (const { fn } of listeners) {
          emitter.off(eventName, fn);
        }

        emitter.emit(eventName, data);

        for (const { getCallCount } of listeners) {
          expect(getCallCount()).toBe(0);
        }

        expect(emitter.listenerCount(eventName)).toBe(0);
      },
    );
  });

  describe("idempotency — repeated unsubscribe is no-op", () => {
    test.prop([arbEventName, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "calling unsubscribe multiple times does not throw",
      (eventName, data) => {
        const emitter = createTestEmitter();
        const [listener] = createUniqueListeners(1);
        const unsub = emitter.on(eventName, listener.fn);

        expect(() => {
          unsub();
          unsub();
          unsub();
        }).not.toThrow();

        emitter.emit(eventName, data);

        expect(listener.getCallCount()).toBe(0);
      },
    );

    test.prop([arbEventName, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "calling off() for a non-registered listener does not throw",
      (eventName, data) => {
        const emitter = createTestEmitter();
        const [listener] = createUniqueListeners(1);

        expect(() => {
          emitter.off(eventName, listener.fn);
          emitter.off(eventName, listener.fn);
        }).not.toThrow();

        emitter.emit(eventName, data);

        expect(listener.getCallCount()).toBe(0);
      },
    );
  });

  describe("clearAll — no listeners called after clearAll", () => {
    test.prop(
      [
        arbEventName,
        fc.array(arbEventName, { minLength: 1, maxLength: 5 }),
        arbData,
      ],
      { numRuns: NUM_RUNS.lifecycle },
    )(
      "clearAll removes all listeners across all events",
      (primaryEvent, extraEvents, data) => {
        const emitter = createTestEmitter();
        const allListeners: ReturnType<typeof createUniqueListeners> = [];

        const primaryListeners = createUniqueListeners(2);

        for (const { fn } of primaryListeners) {
          emitter.on(primaryEvent, fn);
        }

        allListeners.push(...primaryListeners);

        for (const evtName of extraEvents) {
          if (evtName === primaryEvent) {
            continue;
          }

          const extra = createUniqueListeners(1);

          emitter.on(evtName, extra[0].fn);
          allListeners.push(extra[0]);
        }

        emitter.clearAll();

        emitter.emit(primaryEvent, data);

        for (const evtName of extraEvents) {
          if (evtName !== primaryEvent) {
            emitter.emit(evtName, data);
          }
        }

        for (const { getCallCount } of allListeners) {
          expect(getCallCount()).toBe(0);
        }

        expect(emitter.listenerCount(primaryEvent)).toBe(0);
      },
    );
  });

  describe("snapshot — listener added during emit is not called", () => {
    // Initial existing-listener count is varied so size=1 (the historic bug)
    // and size>=2 dispatch paths are exercised symmetrically.
    test.prop([arbEventName, arbData, fc.integer({ min: 0, max: 4 })], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "listener added inside emit handler is not invoked in the current emit",
      (eventName, data, extraListenerCount) => {
        const emitter = createTestEmitter();
        const [laterListener] = createUniqueListeners(1);
        const existingListeners = createUniqueListeners(extraListenerCount);

        const firstFn = (_data: number) => {
          emitter.on(eventName, laterListener.fn);
        };

        emitter.on(eventName, firstFn);

        for (const { fn } of existingListeners) {
          emitter.on(eventName, fn);
        }

        emitter.emit(eventName, data);

        expect(laterListener.getCallCount()).toBe(0);

        emitter.emit(eventName, data);

        expect(laterListener.getCallCount()).toBe(1);

        emitter.off(eventName, firstFn);

        for (const { fn } of existingListeners) {
          emitter.off(eventName, fn);
        }
      },
    );
  });

  describe("mid-emit unsubscribe — iteration is not broken", () => {
    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "unsubscribing a later listener during emit still calls all snapshot listeners",
      (eventName, listenerCount, data) => {
        const emitter = createTestEmitter();
        const listeners = createUniqueListeners(listenerCount);
        const unsubs: (() => void)[] = [];

        for (const { fn } of listeners) {
          unsubs.push(emitter.on(eventName, fn));
        }

        let firstCallDone = false;
        const removerFn = (_data: number) => {
          if (!firstCallDone) {
            firstCallDone = true;
            for (const unsub of unsubs) {
              unsub();
            }
          }
        };

        emitter.on(eventName, removerFn);

        emitter.emit(eventName, data);

        for (const { getCallCount } of listeners) {
          expect(getCallCount()).toBe(1);
        }

        emitter.off(eventName, removerFn);
      },
    );
  });

  describe("snapshot-remove — off()'d listener still fires in current emit", () => {
    test.prop([arbEventName, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "listener removed by another listener during emit still executes from snapshot",
      (eventName, data) => {
        const emitter = createTestEmitter();
        const [victim] = createUniqueListeners(1);

        const removerFn = (_data: number) => {
          emitter.off(eventName, victim.fn);
        };

        emitter.on(eventName, removerFn);
        emitter.on(eventName, victim.fn);

        emitter.emit(eventName, data);

        expect(victim.getCallCount()).toBe(1);

        emitter.emit(eventName, data);

        expect(victim.getCallCount()).toBe(1);

        emitter.off(eventName, removerFn);
      },
    );
  });

  describe("no-listeners — emit without listeners is no-op", () => {
    test.prop([arbEventName, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "emit on event with no listeners does not throw and count stays 0",
      (eventName, data) => {
        const emitter = createTestEmitter();

        expect(() => {
          emitter.emit(eventName, data);
        }).not.toThrow();

        expect(emitter.listenerCount(eventName)).toBe(0);
      },
    );
  });

  describe("listenerCount — reflects current subscription state", () => {
    test.prop([arbEventName, arbListenerCount], {
      numRuns: NUM_RUNS.standard,
    })(
      "listenerCount matches the number of active subscriptions",
      (eventName, listenerCount) => {
        const emitter = createTestEmitter();
        const listeners = createUniqueListeners(listenerCount);
        const unsubs: (() => void)[] = [];

        for (let i = 0; i < listenerCount; i++) {
          unsubs.push(emitter.on(eventName, listeners[i].fn));

          expect(emitter.listenerCount(eventName)).toBe(i + 1);
        }

        for (let i = listenerCount - 1; i >= 0; i--) {
          unsubs[i]();

          expect(emitter.listenerCount(eventName)).toBe(i);
        }
      },
    );
  });

  describe("duplicate rejection — on() with same fn throws", () => {
    test.prop([arbEventName], {
      numRuns: NUM_RUNS.standard,
    })(
      "registering the same function reference twice on the same event throws",
      (eventName) => {
        const emitter = createTestEmitter();
        const [listener] = createUniqueListeners(1);

        emitter.on(eventName, listener.fn);

        expect(() => {
          emitter.on(eventName, listener.fn);
        }).toThrow("Duplicate listener");
      },
    );

    test.prop([arbDistinctEventPair], {
      numRuns: NUM_RUNS.standard,
    })(
      "same function reference on different events does not throw",
      ([eventA, eventB]) => {
        const emitter = createTestEmitter();
        const [listener] = createUniqueListeners(1);

        emitter.on(eventA, listener.fn);

        expect(() => {
          emitter.on(eventB, listener.fn);
        }).not.toThrow();
      },
    );
  });

  describe("error isolation — throwing listener does not prevent others", () => {
    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "a listener that throws does not block subsequent listeners",
      (eventName, listenerCount, data) => {
        const errors: unknown[] = [];

        const emitter = new EventEmitter<TestEventMap>({
          onListenerError: (_name, error) => {
            errors.push(error);
          },
        });

        const throwingFn = (_data: number) => {
          throw new Error("boom");
        };

        emitter.on(eventName, throwingFn);

        const listeners = createUniqueListeners(listenerCount);

        for (const { fn } of listeners) {
          emitter.on(eventName, fn);
        }

        emitter.emit(eventName, data);

        for (const { getCallCount, getLastData } of listeners) {
          expect(getCallCount()).toBe(1);
          expect(getLastData()).toBe(data);
        }

        expect(errors).toHaveLength(1);

        emitter.off(eventName, throwingFn);
      },
    );
  });

  describe("maxListeners — throws when limit exceeded", () => {
    test.prop([arbEventName, arbMaxListeners], {
      numRuns: NUM_RUNS.standard,
    })(
      "registering more than maxListeners throws",
      (eventName, maxListeners) => {
        const emitter = new EventEmitter<TestEventMap>({
          limits: { maxListeners, warnListeners: 0 },
        });

        const listeners = createUniqueListeners(maxListeners + 1);

        for (let i = 0; i < maxListeners; i++) {
          emitter.on(eventName, listeners[i].fn);
        }

        expect(emitter.listenerCount(eventName)).toBe(maxListeners);

        expect(() => {
          emitter.on(eventName, listeners[maxListeners].fn);
        }).toThrow("Listener limit");
      },
    );
  });

  describe("validateCallback — non-function throws TypeError", () => {
    test.prop([arbNonFunction, arbEventName], {
      numRuns: NUM_RUNS.standard,
    })(
      "non-function values cause validateCallback to throw TypeError",
      (value, eventName) => {
        expect(() => {
          EventEmitter.validateCallback(value, eventName);
        }).toThrow(TypeError);
      },
    );
  });

  describe("in-flight guard release — same event re-emits after dispatch", () => {
    test.prop([arbEventName, arbData, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "the re-entrancy guard releases after dispatch, so a later emit of the same event fires",
      (eventName, data1, data2) => {
        const emitter = createTestEmitter();
        const [listener] = createUniqueListeners(1);

        // The listener re-emits the SAME event during its own dispatch. That
        // re-entrant emit is coalesced to a no-op (depth ≤ 1), but the guard
        // must release in the `finally`, so each *separate* outer emit runs the
        // listener exactly once.
        const reentrant = (data: number) => {
          listener.fn(data);
          emitter.emit(eventName, data);
        };

        emitter.on(eventName, reentrant);

        emitter.emit(eventName, data1);

        expect(listener.getCallCount()).toBe(1);
        expect(listener.getLastData()).toBe(data1);

        // Guard released after the first dispatch — a second emit fires again.
        emitter.emit(eventName, data2);

        expect(listener.getCallCount()).toBe(2);
        expect(listener.getLastData()).toBe(data2);

        emitter.off(eventName, reentrant);
      },
    );
  });

  describe("re-registration after off() — listener works after off+on", () => {
    test.prop([arbEventName, arbData, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "listener receives events after off() followed by on()",
      (eventName, data1, data2) => {
        const emitter = createTestEmitter();
        const [listener] = createUniqueListeners(1);

        // Register, emit, verify
        emitter.on(eventName, listener.fn);
        emitter.emit(eventName, data1);

        expect(listener.getCallCount()).toBe(1);

        // Unsubscribe
        emitter.off(eventName, listener.fn);
        emitter.emit(eventName, data1);

        expect(listener.getCallCount()).toBe(1); // not called again

        // Re-register
        emitter.on(eventName, listener.fn);
        emitter.emit(eventName, data2);

        expect(listener.getCallCount()).toBe(2);
        expect(listener.getLastData()).toBe(data2);
      },
    );
  });

  describe("warnListeners — onListenerWarn called at threshold", () => {
    test.prop([arbEventName, arbWarnThreshold], {
      numRuns: NUM_RUNS.standard,
    })(
      "onListenerWarn fires when registration exceeds warn threshold",
      (eventName, warnThreshold) => {
        const warnings: { event: string; count: number }[] = [];

        const emitter = new EventEmitter<TestEventMap>({
          limits: {
            maxListeners: 0,
            warnListeners: warnThreshold,
          },
          onListenerWarn: (event, count) => {
            warnings.push({ event, count });
          },
        });

        const listeners = createUniqueListeners(warnThreshold + 1);

        // Register one at a time and pin the exact firing point: the first W
        // registrations must NOT warn — the warn fires only on the (W+1)th.
        // A total-count assertion alone is blind to a threshold off-by-one
        // (fire one early / late); per-step pinning catches both directions.
        for (let i = 0; i < warnThreshold; i++) {
          emitter.on(eventName, listeners[i].fn);

          expect(warnings).toHaveLength(0);
        }

        emitter.on(eventName, listeners[warnThreshold].fn);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toStrictEqual({
          event: eventName,
          count: warnThreshold,
        });
      },
    );
  });

  describe("warnListeners — onListenerWarn fires exactly once across churn", () => {
    test.prop([arbEventName, arbWarnThreshold], {
      numRuns: NUM_RUNS.standard,
    })(
      "off/on churn around the threshold never re-fires the warning",
      (eventName, warnThreshold) => {
        const warnings: { event: string; count: number }[] = [];

        const emitter = new EventEmitter<TestEventMap>({
          limits: {
            maxListeners: 0,
            warnListeners: warnThreshold,
          },
          onListenerWarn: (event, count) => {
            warnings.push({ event, count });
          },
        });

        // Fill up to the threshold — no warning yet.
        for (const { fn } of createUniqueListeners(warnThreshold)) {
          emitter.on(eventName, fn);
        }

        // Re-cross the threshold repeatedly: each round adds the (W+1)th
        // listener (set.size === warnThreshold, the warn trigger) and removes
        // it again. The latch must keep the warning to a single firing.
        for (let round = 0; round < 3; round++) {
          const [extra] = createUniqueListeners(1);
          const unsub = emitter.on(eventName, extra.fn);

          unsub();
        }

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toStrictEqual({
          event: eventName,
          count: warnThreshold,
        });
      },
    );
  });

  // ===========================================================================
  // Stateful / sequence consistency — model-based testing
  // ===========================================================================

  describe("sequence consistency — emitter state matches a reference model", () => {
    type Op =
      | { type: "on"; event: EventName; id: number }
      | { type: "off"; event: EventName; id: number }
      | { type: "emit"; event: EventName; data: number }
      | { type: "clear" };

    const arbId = fc.integer({ min: 0, max: 7 });
    const arbOp: fc.Arbitrary<Op> = fc.oneof(
      fc.record({
        type: fc.constant("on" as const),
        event: arbEventName,
        id: arbId,
      }),
      fc.record({
        type: fc.constant("off" as const),
        event: arbEventName,
        id: arbId,
      }),
      fc.record({
        type: fc.constant("emit" as const),
        event: arbEventName,
        data: arbData,
      }),
      fc.record({ type: fc.constant("clear" as const) }),
    );

    test.prop([fc.array(arbOp, { minLength: 1, maxLength: 60 })], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "any interleaving of on/off/emit/clearAll keeps delivery, order and count consistent",
      (ops) => {
        const emitter = createTestEmitter();
        const calls: number[] = [];
        // Stable, distinct fn per id; records its id when invoked.
        const fns = Array.from({ length: 8 }, (_, id) => () => {
          calls.push(id);
        });
        // Reference model: event → ordered list of registered ids (insertion order).
        const model = new Map<EventName, number[]>();

        for (const op of ops) {
          switch (op.type) {
            case "on": {
              const current = model.get(op.event) ?? [];

              if (current.includes(op.id)) {
                // Duplicate registration must throw and leave state untouched.
                expect(() => emitter.on(op.event, fns[op.id])).toThrow(
                  "Duplicate listener",
                );
              } else {
                emitter.on(op.event, fns[op.id]);
                model.set(op.event, [...current, op.id]);
              }

              break;
            }
            case "off": {
              emitter.off(op.event, fns[op.id]);
              const current = model.get(op.event) ?? [];

              model.set(
                op.event,
                current.filter((x) => x !== op.id),
              );

              break;
            }
            case "emit": {
              calls.length = 0;
              emitter.emit(op.event, op.data);

              // Exactly the modelled listeners fire, in registration order.
              expect(calls).toStrictEqual(model.get(op.event) ?? []);

              break;
            }
            default: {
              emitter.clearAll();
              model.clear();
            }
          }

          // Count invariant holds for every event after every operation.
          for (const event of EVENT_NAMES) {
            expect(emitter.listenerCount(event)).toBe(
              (model.get(event) ?? []).length,
            );
          }
        }
      },
    );
  });

  // ===========================================================================
  // Atomic failure — a throwing on() leaves state untouched
  // ===========================================================================

  describe("atomic registration — a rejected on() does not mutate state", () => {
    test.prop([arbEventName, arbListenerCount, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "a rejected duplicate on() leaves listenerCount and delivery untouched",
      (eventName, listenerCount, data) => {
        const emitter = createTestEmitter();
        const listeners = createUniqueListeners(listenerCount);

        for (const { fn } of listeners) {
          emitter.on(eventName, fn);
        }

        expect(() => emitter.on(eventName, listeners[0].fn)).toThrow(
          "Duplicate listener",
        );
        expect(emitter.listenerCount(eventName)).toBe(listenerCount);

        emitter.emit(eventName, data);

        for (const { getCallCount } of listeners) {
          expect(getCallCount()).toBe(1);
        }
      },
    );

    test.prop([arbEventName, arbMaxListeners, arbData], {
      numRuns: NUM_RUNS.standard,
    })(
      "an on() that hits maxListeners throws atomically and never warns (warn === max)",
      (eventName, maxListeners, data) => {
        const warnings: number[] = [];
        const emitter = new EventEmitter<TestEventMap>({
          limits: {
            maxListeners,
            warnListeners: maxListeners,
          },
          onListenerWarn: (_event, count) => {
            warnings.push(count);
          },
        });
        const listeners = createUniqueListeners(maxListeners + 1);

        for (let i = 0; i < maxListeners; i++) {
          emitter.on(eventName, listeners[i].fn);
        }

        expect(() => emitter.on(eventName, listeners[maxListeners].fn)).toThrow(
          "Listener limit",
        );
        expect(emitter.listenerCount(eventName)).toBe(maxListeners);
        expect(warnings).toHaveLength(0);

        emitter.emit(eventName, data);

        for (let i = 0; i < maxListeners; i++) {
          expect(listeners[i].getCallCount()).toBe(1);
        }

        expect(listeners[maxListeners].getCallCount()).toBe(0);
      },
    );
  });

  // ===========================================================================
  // Coalesce — a re-entrant same-event emit is a no-op (depth ≤ 1)
  // ===========================================================================

  describe("coalesce — re-entrant same-event emit runs the listener exactly once", () => {
    test.prop(
      [
        arbEventName,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 0, max: 4 }),
        arbData,
      ],
      { numRuns: NUM_RUNS.lifecycle },
    )(
      "a listener that re-emits the same event never re-enters dispatch (depth ≤ 1)",
      (eventName, reEmitAttempts, extraCount, data) => {
        const emitter = createTestEmitter();

        let depth = 0;
        let maxObserved = 0;
        let reentrantCalls = 0;

        const selfEmitter = (d: number) => {
          depth++;
          maxObserved = Math.max(maxObserved, depth);
          reentrantCalls++;

          // Every re-entrant emit of the in-flight event is coalesced away,
          // no matter how many times it is attempted — no recursion, no throw.
          for (let i = 0; i < reEmitAttempts; i++) {
            emitter.emit(eventName, d);
          }

          depth--;
        };

        emitter.on(eventName, selfEmitter);

        // Extra co-listeners exercise both the size===1 fast path and the
        // size>=2 snapshot path of dispatch.
        const extra = createUniqueListeners(extraCount);

        for (const { fn } of extra) {
          emitter.on(eventName, fn);
        }

        expect(() => {
          emitter.emit(eventName, data);
        }).not.toThrow();

        // The self-emitting listener ran once; recursion never deepened past 1.
        expect(reentrantCalls).toBe(1);
        expect(maxObserved).toBe(1);

        // Coalescing the re-entrant emit does not suppress the original
        // dispatch: every co-registered listener still fired exactly once.
        for (const { getCallCount } of extra) {
          expect(getCallCount()).toBe(1);
        }

        emitter.off(eventName, selfEmitter);

        for (const { fn } of extra) {
          emitter.off(eventName, fn);
        }
      },
    );
  });

  // ===========================================================================
  // Coalesce is per-event — a DIFFERENT event emitted from a listener still fires
  // ===========================================================================

  describe("coalesce is per-event — a different event emitted from a listener fires", () => {
    test.prop(
      [arbDistinctEventPair, fc.integer({ min: 1, max: 5 }), arbData, arbData],
      { numRuns: NUM_RUNS.lifecycle },
    )(
      "while event A is in flight, emitting a different event B still dispatches B's listeners",
      ([eventA, eventB], bListenerCount, dataA, dataB) => {
        const emitter = createTestEmitter();
        const bListeners = createUniqueListeners(bListenerCount);

        for (const { fn } of bListeners) {
          emitter.on(eventB, fn);
        }

        // A's listener emits B while A is being dispatched. The in-flight guard
        // is keyed per event name, so B is NOT suppressed — it dispatches fully.
        const aListener = (_data: number) => {
          emitter.emit(eventB, dataB);
        };

        emitter.on(eventA, aListener);

        emitter.emit(eventA, dataA);

        for (const { getCallCount, getLastData } of bListeners) {
          expect(getCallCount()).toBe(1);
          expect(getLastData()).toBe(dataB);
        }

        emitter.off(eventA, aListener);
      },
    );
  });

  // ===========================================================================
  // Argument arity — emit dispatches the exact arg count (#callListener switch)
  // ===========================================================================

  describe("argument arity — emit forwards 0..4 positional args", () => {
    test.prop(
      [
        arbEventName,
        fc.integer({ min: 0, max: 4 }),
        fc.tuple(arbData, arbData, arbData, arbData),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "emit dispatches exactly argc positional arguments to listeners",
      (eventName, argc, [a, b, c, d]) => {
        const emitter = createTestEmitter();
        let received: unknown[] = [];

        emitter.on(eventName, (...args: unknown[]) => {
          received = args;
        });

        switch (argc) {
          case 0: {
            emitter.emit(eventName);

            break;
          }
          case 1: {
            emitter.emit(eventName, a);

            break;
          }
          case 2: {
            emitter.emit(eventName, a, b);

            break;
          }
          case 3: {
            emitter.emit(eventName, a, b, c);

            break;
          }
          default: {
            emitter.emit(eventName, a, b, c, d);
          }
        }

        expect(received).toStrictEqual([a, b, c, d].slice(0, argc));
      },
    );
  });

  // ===========================================================================
  // Error forwarding — all listener errors reported in order, non-throwers run
  // ===========================================================================

  describe("error forwarding — every error reported in order", () => {
    test.prop(
      [
        arbEventName,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        arbData,
      ],
      { numRuns: NUM_RUNS.lifecycle },
    )(
      "every throwing listener forwards its error in order; non-throwers all run",
      (eventName, throwFlags, data) => {
        const reported: unknown[] = [];
        const emitter = new EventEmitter<TestEventMap>({
          onListenerError: (_event, error) => {
            reported.push(error);
          },
        });

        const expectedErrors: unknown[] = [];
        const nonThrowers: ReturnType<typeof createUniqueListeners> = [];

        throwFlags.forEach((shouldThrow, i) => {
          if (shouldThrow) {
            const error = new Error(`boom-${i}`);

            expectedErrors.push(error);
            emitter.on(eventName, () => {
              throw error;
            });
          } else {
            const [listener] = createUniqueListeners(1);

            nonThrowers.push(listener);
            emitter.on(eventName, listener.fn);
          }
        });

        emitter.emit(eventName, data);

        expect(reported).toStrictEqual(expectedErrors);

        for (const { getCallCount } of nonThrowers) {
          expect(getCallCount()).toBe(1);
        }
      },
    );
  });

  // ===========================================================================
  // Warn latch reset — re-fires after clearAll OR after the last off()
  // ===========================================================================

  describe("warn latch reset — re-fires after a full reset", () => {
    test.prop([arbEventName, arbWarnThreshold], {
      numRuns: NUM_RUNS.standard,
    })(
      "warn re-fires after the latch is reset by removing the last listener or clearAll",
      (eventName, warnThreshold) => {
        const warnings: number[] = [];
        const emitter = new EventEmitter<TestEventMap>({
          limits: {
            maxListeners: 0,
            warnListeners: warnThreshold,
          },
          onListenerWarn: (_event, count) => {
            warnings.push(count);
          },
        });

        // Round 1: cross the threshold → warn fires once.
        const unsubs = createUniqueListeners(warnThreshold + 1).map(({ fn }) =>
          emitter.on(eventName, fn),
        );

        expect(warnings).toHaveLength(1);

        // Reset by removing the last listener (off → empty Set).
        for (const unsub of unsubs) {
          unsub();
        }

        expect(emitter.listenerCount(eventName)).toBe(0);

        // Round 2: fresh accumulation → warn fires again.
        for (const { fn } of createUniqueListeners(warnThreshold + 1)) {
          emitter.on(eventName, fn);
        }

        expect(warnings).toHaveLength(2);

        // Reset by clearAll.
        emitter.clearAll();

        // Round 3: fresh accumulation → warn fires again.
        for (const { fn } of createUniqueListeners(warnThreshold + 1)) {
          emitter.on(eventName, fn);
        }

        expect(warnings).toHaveLength(3);
      },
    );
  });
});
