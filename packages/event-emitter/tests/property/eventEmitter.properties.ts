import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
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
} from "./helpers";
import { EventEmitter } from "../../src/EventEmitter.js";

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
    test.prop([arbEventName, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "listener added inside emit handler is not invoked in the current emit",
      (eventName, data) => {
        const emitter = createTestEmitter();
        const [laterListener] = createUniqueListeners(1);

        const firstFn = (_data: number) => {
          emitter.on(eventName, laterListener.fn);
        };

        emitter.on(eventName, firstFn);
        emitter.emit(eventName, data);

        expect(laterListener.getCallCount()).toBe(0);

        emitter.emit(eventName, data);

        expect(laterListener.getCallCount()).toBe(1);

        emitter.off(eventName, firstFn);
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
        // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter
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
        // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter
        const emitter = new EventEmitter<TestEventMap>({
          limits: { maxListeners, warnListeners: 0, maxEventDepth: 0 },
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

  describe("depth tracking — resets after successful emit", () => {
    test.prop([arbEventName, arbData, arbData], {
      numRuns: NUM_RUNS.lifecycle,
    })(
      "depth counter resets to zero after emit completes",
      (eventName, data1, data2) => {
        // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter
        const emitter = new EventEmitter<TestEventMap>({
          limits: { maxListeners: 0, warnListeners: 0, maxEventDepth: 1 },
        });
        const [listener] = createUniqueListeners(1);

        emitter.on(eventName, listener.fn);

        // First emit — depth goes 0→1→0
        emitter.emit(eventName, data1);

        expect(listener.getCallCount()).toBe(1);

        // Second emit should succeed (depth is back to 0)
        emitter.emit(eventName, data2);

        expect(listener.getCallCount()).toBe(2);
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
        // eslint-disable-next-line unicorn/prefer-event-target -- custom EventEmitter
        const emitter = new EventEmitter<TestEventMap>({
          limits: {
            maxListeners: 0,
            warnListeners: warnThreshold,
            maxEventDepth: 0,
          },
          onListenerWarn: (event, count) => {
            warnings.push({ event, count });
          },
        });

        const listeners = createUniqueListeners(warnThreshold + 1);

        for (let i = 0; i <= warnThreshold; i++) {
          emitter.on(eventName, listeners[i].fn);
        }

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toStrictEqual({
          event: eventName,
          count: warnThreshold,
        });
      },
    );
  });
});
