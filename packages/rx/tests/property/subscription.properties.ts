import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbIntArray,
  arbNonEmptyIntArray,
  collectSync,
  makeSource,
  NUM_RUNS,
} from "./helpers";
import { RxObservable } from "../../src/RxObservable";

describe("Subscription Properties", () => {
  describe("delivery: every emitted value is delivered to all active subscribers", () => {
    test.prop([arbNonEmptyIntArray], { numRuns: NUM_RUNS.standard })(
      "all values reach each subscriber",
      (values) => {
        const source = makeSource(values);
        const received1: number[] = [];
        const received2: number[] = [];

        source.subscribe({ next: (v) => received1.push(v) });
        source.subscribe({ next: (v) => received2.push(v) });

        expect(received1).toStrictEqual(values);
        expect(received2).toStrictEqual(values);
      },
    );
  });

  describe("ordering: values are delivered in emission order", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.standard })(
      "received values appear in the same order as emitted",
      (values) => {
        const results = collectSync(makeSource(values));

        expect(results).toStrictEqual(values);
      },
    );
  });

  describe("unsubscribe: after unsubscribe, no further values are received", () => {
    test.prop([fc.nat({ max: 15 }), fc.nat({ max: 15 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "values emitted after unsubscribe are not delivered",
      (emitBefore, emitAfter) => {
        const received: number[] = [];
        const emitters: ((v: number) => void)[] = [];

        const source = new RxObservable<number>((observer) => {
          const emit = (v: number): void => {
            observer.next?.(v);
          };

          emitters.push(emit);

          return () => {
            const idx = emitters.indexOf(emit);

            if (idx !== -1) {
              emitters.splice(idx, 1);
            }
          };
        });

        const sub = source.subscribe({ next: (v) => received.push(v) });

        for (let i = 0; i < emitBefore; i++) {
          for (const emit of emitters) {
            emit(i);
          }
        }

        sub.unsubscribe();

        for (let i = 0; i < emitAfter; i++) {
          for (const emit of emitters) {
            emit(i + 1000);
          }
        }

        expect(received).toHaveLength(emitBefore);
      },
    );
  });

  describe("cold: each subscribe call creates an independent stream execution", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.standard })(
      "subscribe function is called once per subscription and each receives all values",
      (values) => {
        const callCount = { value: 0 };

        const source = new RxObservable<number>((observer) => {
          callCount.value += 1;

          for (const v of values) {
            observer.next?.(v);
          }
        });

        const results1 = collectSync(source);
        const results2 = collectSync(source);

        expect(callCount.value).toBe(2);
        expect(results1).toStrictEqual(values);
        expect(results2).toStrictEqual(values);
      },
    );
  });

  // =============================================================================
  // Beyond-RFC invariants
  // =============================================================================

  describe("complete stops delivery: no values are delivered after complete()", () => {
    test.prop([fc.nat({ max: 15 }), fc.nat({ max: 15 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "values emitted after complete() are silently dropped",
      (emitBefore, emitAfter) => {
        const received: number[] = [];

        const source = new RxObservable<number>((observer) => {
          for (let i = 0; i < emitBefore; i++) {
            observer.next?.(i);
          }

          observer.complete?.();

          for (let i = 0; i < emitAfter; i++) {
            observer.next?.(i + 1000);
          }
        });

        source.subscribe({ next: (v) => received.push(v) });

        expect(received).toHaveLength(emitBefore);
      },
    );
  });
});
