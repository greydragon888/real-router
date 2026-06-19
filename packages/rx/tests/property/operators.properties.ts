import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  arbDupHeavyIntArray,
  arbIntArray,
  arbNonEmptyIntArray,
  arbNumFn,
  arbNumPred,
  collectSync,
  makeSource,
  NUM_RUNS,
} from "./helpers";
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  takeUntil,
} from "../../src/operators";
import { RxObservable } from "../../src/RxObservable";

describe("Operator Properties", () => {
  describe("functor law: pipe(map(f), map(g)) ≡ pipe(map(x => g(f(x))))", () => {
    test.prop([arbIntArray, arbNumFn, arbNumFn], {
      numRuns: NUM_RUNS.standard,
    })("composing two maps equals a single fused map", (values, f, g) => {
      const lhs = collectSync(makeSource(values).pipe(map(f), map(g)));
      const rhs = collectSync(makeSource(values).pipe(map((x) => g(f(x)))));

      expect(lhs).toStrictEqual(rhs);
    });
  });

  describe("filter correctness: filter(pred) only passes values where pred(v) === true", () => {
    test.prop([arbIntArray, arbNumPred], { numRuns: NUM_RUNS.standard })(
      "all emitted values satisfy the predicate",
      (values, pred) => {
        const results = collectSync(makeSource(values).pipe(filter(pred)));

        for (const v of results) {
          expect(pred(v)).toBe(true);
        }
      },
    );

    test.prop([arbIntArray, arbNumPred], { numRuns: NUM_RUNS.standard })(
      "no values satisfying the predicate are suppressed",
      (values, pred) => {
        const results = collectSync(makeSource(values).pipe(filter(pred)));
        const expected = values.filter((v) => pred(v));

        expect(results).toStrictEqual(expected);
      },
    );
  });

  describe("distinct: distinctUntilChanged never emits two identical consecutive values", () => {
    // arbDupHeavyIntArray (small alphabet) so consecutive duplicates actually
    // occur — exercises the dedup branch; arbIntArray almost never collides.
    test.prop([arbDupHeavyIntArray], { numRuns: NUM_RUNS.standard })(
      "no two consecutive emitted values are strictly equal",
      (values) => {
        const results = collectSync(
          makeSource(values).pipe(distinctUntilChanged()),
        );

        for (let i = 1; i < results.length; i++) {
          expect(results[i]).not.toBe(results[i - 1]);
        }
      },
    );
  });

  describe("distinct reference equivalence: distinctUntilChanged output ≡ filter((v,i) => i===0 || v!==prev)", () => {
    // arbDupHeavyIntArray so the input reliably contains consecutive duplicates;
    // otherwise dedup(input) === input and a passthrough-mutated distinct passes.
    test.prop([arbDupHeavyIntArray], { numRuns: NUM_RUNS.standard })(
      "output equals sequential dedup of the input array",
      (values) => {
        const results = collectSync(
          makeSource(values).pipe(distinctUntilChanged()),
        );
        const expected = values.filter(
          (v, i) => i === 0 || v !== values[i - 1],
        );

        expect(results).toStrictEqual(expected);
      },
    );
  });

  describe("distinct-custom: distinctUntilChanged(eq) uses the provided equality function", () => {
    test.prop(
      [
        fc.array(
          fc.record({
            key: fc.integer({ min: 0, max: 5 }),
            value: fc.integer({ min: -100, max: 100 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "no two consecutive emitted values are equal by the custom comparator",
      (values) => {
        const byKey = (a: { key: number }, b: { key: number }): boolean =>
          a.key === b.key;

        const results = collectSync(
          makeSource(values).pipe(distinctUntilChanged(byKey)),
        );

        for (let i = 1; i < results.length; i++) {
          expect(results[i].key).not.toBe(results[i - 1].key);
        }
      },
    );
  });

  describe("distinct-custom reference equivalence: output ≡ sequential dedup by custom comparator", () => {
    test.prop(
      [
        fc.array(
          fc.record({
            key: fc.integer({ min: 0, max: 5 }),
            value: fc.integer({ min: -100, max: 100 }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "output equals sequential dedup using the custom equality function",
      (values) => {
        const byKey = (a: { key: number }, b: { key: number }): boolean =>
          a.key === b.key;

        const results = collectSync(
          makeSource(values).pipe(distinctUntilChanged(byKey)),
        );
        const expected = values.filter(
          (v, i) => i === 0 || !byKey(values[i - 1], v),
        );

        expect(results).toStrictEqual(expected);
      },
    );
  });

  describe("identity: pipe(map(x => x)) ≡ identity", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.fast })(
      "mapping with identity function preserves all values",
      (values) => {
        const results = collectSync(
          makeSource(values).pipe(map((x: number) => x)),
        );

        expect(results).toStrictEqual(values);
      },
    );
  });

  // =============================================================================
  // Beyond-RFC invariants
  // =============================================================================

  describe("takeUntil passthrough: when notifier stays silent, all source values pass through", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.standard })(
      "all source values are delivered when notifier never emits",
      (values) => {
        const silentNotifier = new RxObservable<unknown>(() => {});

        const results = collectSync(
          makeSource(values).pipe(takeUntil(silentNotifier)),
        );

        expect(results).toStrictEqual(values);
      },
    );
  });

  describe("takeUntil cutoff: after notifier emits, no further source values are delivered", () => {
    test.prop([fc.nat({ max: 15 }), fc.nat({ max: 15 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "values emitted after notifier fires are not delivered",
      (emitBefore, emitAfter) => {
        const received: number[] = [];
        let sourceEmit: ((v: number) => void) | undefined;
        let triggerNotifier: (() => void) | undefined;

        const source = new RxObservable<number>((observer) => {
          sourceEmit = (v) => observer.next?.(v);
        });

        const notifier = new RxObservable<unknown>((observer) => {
          triggerNotifier = () => observer.next?.(undefined);
        });

        source
          .pipe(takeUntil(notifier))
          .subscribe({ next: (v) => received.push(v) });

        for (let i = 0; i < emitBefore; i++) {
          sourceEmit?.(i);
        }

        triggerNotifier?.();

        for (let i = 0; i < emitAfter; i++) {
          sourceEmit?.(i + 1000);
        }

        expect(received).toHaveLength(emitBefore);
      },
    );
  });

  describe("takeUntil sync: synchronous notifier emission prevents all source values", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.fast })(
      "synchronous notifier completes the stream before source emits",
      (values) => {
        const syncNotifier = new RxObservable<unknown>((observer) => {
          observer.next?.(undefined);
        });

        const results = collectSync(
          makeSource(values).pipe(takeUntil(syncNotifier)),
        );

        expect(results).toStrictEqual([]);
      },
    );
  });

  describe("filter idempotence: filter(p) ∘ filter(p) ≡ filter(p)", () => {
    test.prop([arbIntArray, arbNumPred], { numRuns: NUM_RUNS.standard })(
      "applying the same filter twice produces the same result as once",
      (values, pred) => {
        const once = collectSync(makeSource(values).pipe(filter(pred)));
        const twice = collectSync(
          makeSource(values).pipe(filter(pred), filter(pred)),
        );

        expect(twice).toStrictEqual(once);
      },
    );
  });

  describe("distinct idempotence: distinct() ∘ distinct() ≡ distinct()", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.standard })(
      "applying distinctUntilChanged twice produces the same result as once",
      (values) => {
        const once = collectSync(
          makeSource(values).pipe(distinctUntilChanged()),
        );
        const twice = collectSync(
          makeSource(values).pipe(
            distinctUntilChanged(),
            distinctUntilChanged(),
          ),
        );

        expect(twice).toStrictEqual(once);
      },
    );
  });

  describe("map preserves length: map(f) emits exactly as many values as source", () => {
    test.prop([arbIntArray, arbNumFn], { numRuns: NUM_RUNS.standard })(
      "map emits exactly one value per source value",
      (values, f) => {
        const results = collectSync(makeSource(values).pipe(map(f)));

        expect(results).toHaveLength(values.length);
      },
    );
  });

  describe("map reference equivalence: map(f) applies f to every value (≡ values.map(f))", () => {
    test.prop([arbIntArray, arbNumFn], { numRuns: NUM_RUNS.standard })(
      "mapped output equals applying f to each source value in order",
      (values, f) => {
        const actual = collectSync(makeSource(values).pipe(map(f)));

        expect(actual).toStrictEqual(values.map((v) => f(v)));
      },
    );
  });

  describe("debounceTime validation: invalid durations throw RangeError, valid ones are accepted", () => {
    test.prop([fc.integer({ min: 0, max: 10_000 })], {
      numRuns: NUM_RUNS.fast,
    })(
      "non-negative finite duration is accepted without throwing",
      (duration) => {
        expect(() => {
          debounceTime(duration);
        }).not.toThrow();
      },
    );

    test.prop(
      [
        fc.oneof(
          fc.integer({ min: -10_000, max: -1 }),
          fc.constant(Number.NaN),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
        ),
      ],
      { numRuns: NUM_RUNS.fast },
    )("negative, NaN, or infinite duration throws RangeError", (duration) => {
      expect(() => {
        debounceTime(duration);
      }).toThrow(RangeError);
    });
  });

  describe("filter composition: filter(p) ∘ filter(q) ≡ filter(x => p(x) && q(x))", () => {
    test.prop([arbIntArray, arbNumPred, arbNumPred], {
      numRuns: NUM_RUNS.standard,
    })(
      "chaining two filters equals filtering by their conjunction",
      (values, p, q) => {
        const chained = collectSync(
          makeSource(values).pipe(filter(p), filter(q)),
        );
        const conjunction = collectSync(
          makeSource(values).pipe(filter((x) => p(x) && q(x))),
        );

        expect(chained).toStrictEqual(conjunction);
        expect(chained).toStrictEqual(values.filter((v) => p(v) && q(v)));
      },
    );
  });

  describe("debounceTime burst: a synchronous burst emits exactly the last value", () => {
    test.prop([arbNonEmptyIntArray, fc.integer({ min: 1, max: 1000 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "after a synchronous burst, debounceTime(d) emits only the final value",
      (burst, duration) => {
        vi.useFakeTimers();

        try {
          const emitted: number[] = [];

          makeSource(burst)
            .pipe(debounceTime(duration))
            .subscribe({ next: (v) => emitted.push(v) });

          vi.advanceTimersByTime(duration + 1);

          expect(emitted).toStrictEqual([burst[burst.length - 1]]);
        } finally {
          vi.useRealTimers();
        }
      },
    );
  });

  describe("operator chain ≡ manual reference: random map/filter/distinct pipelines", () => {
    const arbOp = fc.oneof(
      arbNumFn.map((f) => ({ kind: "map" as const, f })),
      arbNumPred.map((p) => ({ kind: "filter" as const, p })),
      fc.constant({ kind: "distinct" as const }),
    );

    test.prop([arbIntArray, fc.array(arbOp, { maxLength: 6 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "a random pipeline equals applying the same operators manually in JS",
      (values, ops) => {
        let piped: RxObservable<number> = makeSource(values);

        for (const op of ops) {
          if (op.kind === "map") {
            piped = piped.pipe(map(op.f));
          } else if (op.kind === "filter") {
            piped = piped.pipe(filter(op.p));
          } else {
            piped = piped.pipe(distinctUntilChanged());
          }
        }

        const actual = collectSync(piped);

        let reference = values;

        for (const op of ops) {
          if (op.kind === "map") {
            reference = reference.map((v) => op.f(v));
          } else if (op.kind === "filter") {
            reference = reference.filter((v) => op.p(v));
          } else {
            reference = reference.filter(
              (v, i, arr) => i === 0 || v !== arr[i - 1],
            );
          }
        }

        expect(actual).toStrictEqual(reference);
      },
    );
  });
});
