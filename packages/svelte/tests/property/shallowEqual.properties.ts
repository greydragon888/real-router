// packages/svelte/tests/property/shallowEqual.properties.ts

/**
 * Property-based tests for `shallowEqual` from `shared/dom-utils/link-utils.ts`.
 *
 * The function is the comparator used by `navigateWithHash` for the
 * same-route same-params hash-change detection (#532) and by every Link
 * memoization layer. It must hold:
 *
 * - **Reflexivity:** `shallowEqual(o, o) === true` (Object.is fast-path).
 * - **Symmetry:** `shallowEqual(a, b) === shallowEqual(b, a)` — iterating keys
 *   from either side must yield the same verdict.
 * - **NaN-aware:** uses `Object.is`, not `===`. `Object.is(NaN, NaN) === true`,
 *   `Object.is(+0, -0) === false`. Strict equality (`===`) would invert both.
 * - **Nullable short-circuit:** `(undefined, {})` and `({}, undefined)` are
 *   both `false`. Without the check, the loop would NPE.
 * - **Key-count short-circuit:** different `Object.keys.length` → immediate
 *   `false` without iterating values (perf invariant, also handles superset).
 * - **Key-order insensitivity:** `{a:1, b:2}` and `{b:2, a:1}` are equal —
 *   the loop iterates one side's keys and looks up in the other.
 * - **`hasOwnProperty` guard:** an explicit-undefined key on one side is NOT
 *   equal to a missing key on the other — locks the React-style hasOwnProperty
 *   check.
 *
 * Closes review §2.2 MEDIUM gaps for `shallowEqual` (was completely absent
 * from property tests despite being used by `navigateWithHash`).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  SYMBOL_A,
  SYMBOL_B,
  arbDate,
  arbDeepRecord,
  arbExtendedPrimitive,
  arbExtendedRecord,
} from "./helpers";
import { shallowEqual } from "../../src/dom-utils";

describe("shallowEqual — Property Tests", () => {
  describe("Invariant 1: reflexivity — shallowEqual(o, o) === true", () => {
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.thorough })(
      "any record is shallow-equal to itself (Object.is fast-path)",
      (o) => {
        expect(shallowEqual(o, o)).toBe(true);
      },
    );
  });

  describe("Invariant 2: symmetry — shallowEqual(a, b) === shallowEqual(b, a)", () => {
    test.prop([arbExtendedRecord, arbExtendedRecord], {
      numRuns: NUM_RUNS.thorough,
    })("comparison verdict is order-independent", (a, b) => {
      expect(shallowEqual(a, b)).toBe(shallowEqual(b, a));
    });
  });

  describe("Invariant 3: NaN-aware (Object.is, not ===)", () => {
    // Object.is(NaN, NaN) === true, while NaN === NaN is false.
    // Strict equality would treat two records with NaN values as not equal.
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "NaN values compare equal across distinct objects",
      (base) => {
        const a = { ...base, n: Number.NaN };
        const b = { ...base, n: Number.NaN };

        expect(shallowEqual(a, b)).toBe(true);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "+0 and -0 are NOT equal (Object.is semantics)",
      (base) => {
        const a = { ...base, z: 0 };
        const b = { ...base, z: -0 };

        // Object.is(+0, -0) === false, so the records must differ.
        expect(shallowEqual(a, b)).toBe(false);
      },
    );
  });

  describe("Invariant 4: nullable short-circuit", () => {
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "shallowEqual(undefined, record) === false (no NPE)",
      (o) => {
        expect(shallowEqual(undefined, o)).toBe(false);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "shallowEqual(record, undefined) === false (no NPE)",
      (o) => {
        expect(shallowEqual(o, undefined)).toBe(false);
      },
    );

    test("shallowEqual(undefined, undefined) === true (Object.is fast-path)", () => {
      expect(shallowEqual(undefined, undefined)).toBe(true);
    });
  });

  // Closes review §2.4 "edge cases not covered: empty object". Two distinct
  // empty literals must compare equal — Object.keys({}).length === 0 means
  // the iteration loop is vacuously true. A regression that treated empty
  // objects as not-equal (e.g. a misplaced `if (keys.length === 0) return false`)
  // would break Link memoization for the common no-params case.
  describe("Invariant 4b: empty objects are equal (length-0 short-circuit)", () => {
    test("shallowEqual({}, {}) === true (distinct refs, zero keys)", () => {
      expect(shallowEqual({}, {})).toBe(true);
      // Reversed for symmetry.
      expect(shallowEqual({}, {})).toBe(true);
    });

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "shallowEqual({}, non-empty) === false (key-count mismatch)",
      (o) => {
        fc.pre(Object.keys(o).length > 0);

        expect(shallowEqual({}, o)).toBe(false);
        expect(shallowEqual(o, {})).toBe(false);
      },
    );
  });

  describe("Invariant 5: key-count short-circuit (different size → false)", () => {
    test.prop(
      [
        arbExtendedRecord,
        fc.stringMatching(/^[a-z]{1,4}$/),
        arbExtendedPrimitive,
      ],
      {
        numRuns: NUM_RUNS.standard,
      },
    )(
      "adding a new key to one side breaks equality",
      (base, extraKey, extraVal) => {
        fc.pre(!(extraKey in base));

        const a = { ...base };
        const b = { ...base, [extraKey]: extraVal };

        expect(shallowEqual(a, b)).toBe(false);
        // Symmetry: same verdict reversed.
        expect(shallowEqual(b, a)).toBe(false);
      },
    );
  });

  describe("Invariant 6: key-order insensitivity", () => {
    // The loop iterates one side's keys and looks up the other side via
    // hasOwnProperty + Object.is — order of insertion in the literal must not
    // affect the verdict.
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.thorough })(
      "reversing key insertion order does not change equality",
      (o) => {
        const keys = Object.keys(o);

        const reversed: Record<string, unknown> = {};

        for (let i = keys.length - 1; i >= 0; i--) {
          const key = keys[i];

          reversed[key] = o[key];
        }

        expect(shallowEqual(o, reversed)).toBe(true);
        expect(shallowEqual(reversed, o)).toBe(true);
      },
    );
  });

  describe("Invariant 7: Symbol values (Object.is by reference)", () => {
    // Object.is treats symbols by reference: SYMBOL_A === SYMBOL_A is true,
    // SYMBOL_A === SYMBOL_B is false. shallowEqual must propagate that.
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "same Symbol ref on both sides → true",
      (base) => {
        const a = { ...base, sym: SYMBOL_A };
        const b = { ...base, sym: SYMBOL_A };

        expect(shallowEqual(a, b)).toBe(true);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "distinct Symbol refs on each side → false",
      (base) => {
        const a = { ...base, sym: SYMBOL_A };
        const b = { ...base, sym: SYMBOL_B };

        expect(shallowEqual(a, b)).toBe(false);
      },
    );
  });

  describe("Invariant 8: Date values (Object.is by reference, not by epoch)", () => {
    // Two `new Date(0)` instances have identical valueOf() but are distinct
    // objects — `Object.is` returns false. shallowEqual must not fall back to
    // any deep-equality path for Date.
    test.prop([arbExtendedRecord, arbDate], { numRuns: NUM_RUNS.standard })(
      "same Date ref on both sides → true",
      (base, date) => {
        const a = { ...base, d: date };
        const b = { ...base, d: date };

        expect(shallowEqual(a, b)).toBe(true);
      },
    );

    test.prop(
      [arbExtendedRecord, fc.integer({ min: 0, max: 4_102_444_800_000 })],
      {
        numRuns: NUM_RUNS.standard,
      },
    )(
      "distinct Date refs with identical epoch → false (no deep compare)",
      (base, epoch) => {
        const a = { ...base, d: new Date(epoch) };
        const b = { ...base, d: new Date(epoch) };

        expect(shallowEqual(a, b)).toBe(false);
      },
    );
  });

  describe("Invariant 9: nested objects compared by reference (no deep compare)", () => {
    // shallowEqual descends only one level deep. Two records carrying
    // structurally-identical-but-distinct nested refs are NOT equal — consumers
    // who want deep equality stabilize the ref themselves (useMemo / cached
    // source). This locks the contract so a future "improvement" can't silently
    // switch to deep equality.
    test.prop([arbDeepRecord], { numRuns: NUM_RUNS.thorough })(
      "same nested-object ref → reflexive true (Object.is fast-path)",
      (o) => {
        expect(shallowEqual(o, o)).toBe(true);
      },
    );

    test.prop([fc.integer({ min: -1000, max: 1000 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "structurally-identical nested objects with distinct refs → false",
      (x) => {
        const a = { nested: { x } };
        const b = { nested: { x } };

        expect(shallowEqual(a, b)).toBe(false);
      },
    );

    test.prop([fc.integer({ min: -1000, max: 1000 })], {
      numRuns: NUM_RUNS.standard,
    })("same nested-object ref shared between both sides → true", (x) => {
      const sharedNested = { x };
      const a = { nested: sharedNested };
      const b = { nested: sharedNested };

      expect(shallowEqual(a, b)).toBe(true);
    });
  });

  describe("Invariant 10: explicit-undefined value counts as a present key", () => {
    // The hasOwnProperty guard inside the loop is the difference between
    // React's shallowEqual and a naïve `prev[k] === next[k]` loop. Without it,
    // a key missing in `next` reads as `undefined` and falsely matches
    // `prev[key] === undefined`. The length-mismatch short-circuit covers the
    // simple case (adding a key shifts `Object.keys.length`); the harder case
    // is two records with the same key count but where one has `{ a: 1, b: undefined }`
    // and the other has `{ a: 1, c: undefined }`. The hasOwnProperty guard
    // makes these unequal even though both keys read as undefined.
    test.prop([arbExtendedRecord, fc.stringMatching(/^[a-z]{1,4}$/)], {
      numRuns: NUM_RUNS.standard,
    })(
      "adding an explicit-undefined key to one side breaks equality",
      (base, extraKey) => {
        fc.pre(!(extraKey in base));

        const a = { ...base };
        const b = { ...base, [extraKey]: undefined };

        expect(shallowEqual(a, b)).toBe(false);
        expect(shallowEqual(b, a)).toBe(false);
      },
    );

    test("locks documented case: shallowEqual({a:1, b:undefined}, {a:1}) === false", () => {
      expect(shallowEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
      expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    });

    test("hasOwnProperty guard: same key count but different keys with undefined values → false", () => {
      // Both records have one own-property whose value is `undefined`, but
      // the keys differ. Without the `hasOwnProperty` guard inside the loop,
      // `prev.b` (undefined, missing) would falsely match `next.b` (undefined,
      // missing). The guard short-circuits to false.
      expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
      expect(shallowEqual({ b: undefined }, { a: undefined })).toBe(false);
    });
  });

  // Closes review §5.5 row 6: explicit pin-tests for BigInt equality via
  // Object.is. `Object.is(1n, 1n) === true` — BigInt is compared by value,
  // not by reference (unlike Date/Symbol). A regression that swapped Object.is
  // for `===` would still pass for ordinary numbers, but BigInt under `===`
  // also returns true for same-value (same as Object.is), so this lock
  // is more about ensuring BigInt is accepted in records at all (the function
  // signature is `object | undefined` which accepts any value type).
  describe("Invariant 11: BigInt values compared by Object.is (by value)", () => {
    test.prop([fc.bigInt({ min: -1000n, max: 1000n })], {
      numRuns: NUM_RUNS.standard,
    })("same BigInt value on both sides → true", (n) => {
      const a = { count: n };
      const b = { count: n };

      expect(shallowEqual(a, b)).toBe(true);
    });

    test.prop(
      [
        fc.bigInt({ min: -1000n, max: 1000n }),
        fc.bigInt({ min: -1000n, max: 1000n }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("different BigInt values → false", (a, b) => {
      fc.pre(a !== b);

      expect(shallowEqual({ n: a }, { n: b })).toBe(false);
    });

    test("BigInt vs Number with same numeric value → false (no coercion)", () => {
      // Object.is(1n, 1) === false — types matter.
      expect(shallowEqual({ n: 1n }, { n: 1 })).toBe(false);
    });

    test("zero BigInt vs zero Number → false (different types)", () => {
      expect(shallowEqual({ n: 0n }, { n: 0 })).toBe(false);
    });
  });

  // Closes review §6 LOW #5: large records (100+ keys) with mixed
  // Symbol/BigInt/Date/NaN values. shallowEqual is the comparator behind
  // every Link memoization layer; pathological-size records appear when
  // consumers stuff a large query-params object through `<Link routeParams>`.
  // The loop iterates `Object.keys(prev).length` times and does an
  // `Object.is` lookup per key — O(n). A regression that slipped a
  // quadratic step (e.g. nested `Object.keys(next).includes(key)`) would
  // still produce correct results but blow up time; this test catches both
  // correctness AND a stack/heap blowup.
  //
  // Why standalone rather than parameterised by arbExtendedRecord: we want
  // a deterministic large fixture where we control which keys differ, so
  // we can assert specific equality/inequality outcomes. Property tests
  // above already cover random small records.
  describe("Invariant 12b: Large records (100+ keys, mixed Symbol/BigInt/Date) — O(n) correctness", () => {
    function buildLargeRecord(
      n: number,
      seed: { date: Date; sym: symbol },
    ): Record<string | symbol, unknown> {
      const record: Record<string | symbol, unknown> = {};

      for (let i = 0; i < n; i++) {
        const key = `k${i}`;

        // Round-robin across 5 value-type categories to exercise every
        // Object.is branch under load.
        switch (i % 5) {
          case 0: {
            record[key] = seed.sym;

            break;
          }
          case 1: {
            record[key] = BigInt(100 + i);

            break;
          }
          case 2: {
            record[key] = seed.date;

            break;
          }
          case 3: {
            record[key] = i % 7 === 0 ? Number.NaN : i;

            break;
          }
          default: {
            record[key] = `value_${i}`;

            break;
          }
        }
      }

      return record;
    }

    it("two 200-key identical records (Symbol/BigInt/Date refs shared) compare equal", () => {
      const seed = { date: new Date(0), sym: Symbol.for("svelte-pbt-large") };
      const a = buildLargeRecord(200, seed);
      // Re-build with the SAME seed so Symbol refs are identical and the
      // Date ref is shared (Symbol.for returns the registered symbol; we
      // pass the same Date instance).
      const b = buildLargeRecord(200, seed);

      expect(shallowEqual(a, b)).toBe(true);
      expect(shallowEqual(b, a)).toBe(true); // symmetry holds at scale
    });

    it("two 200-key records differing on ONE BigInt value compare unequal", () => {
      const seed = { date: new Date(0), sym: Symbol.for("svelte-pbt-large") };
      const a = buildLargeRecord(200, seed);
      const b = buildLargeRecord(200, seed);

      // k101 is at index 101, 101 % 5 === 1 → BigInt category. Mutate.
      b.k101 = 999_999n;

      expect(shallowEqual(a, b)).toBe(false);
      expect(shallowEqual(b, a)).toBe(false);
    });

    it("two 200-key records differing on ONE Date ref (same epoch) compare unequal", () => {
      const epoch = 1_700_000_000_000;
      const sym = Symbol.for("svelte-pbt-large-date");
      const a = buildLargeRecord(200, { date: new Date(epoch), sym });
      const b = buildLargeRecord(200, { date: new Date(epoch), sym });

      // Every k where i % 5 === 2 is the shared Date — but each call to
      // buildLargeRecord receives a freshly-built Date so a and b have
      // distinct Date refs throughout. Object.is identifies the difference
      // on the FIRST Date-category key (k2).
      expect(shallowEqual(a, b)).toBe(false);
    });

    it("two 500-key records — no stack overflow, O(n) iteration completes", () => {
      const seed = { date: new Date(0), sym: Symbol.for("svelte-pbt-500") };
      const a = buildLargeRecord(500, seed);
      const b = buildLargeRecord(500, seed);

      // Plain assertion — completion under default timeout is itself the
      // perf check. A regression to O(n²) on 500 keys would push runtime
      // into seconds; vitest would surface it as a slow-test warning.
      expect(shallowEqual(a, b)).toBe(true);
    });

    it("symbol-keyed extras on a 200-key record are ignored (Object.keys excludes Symbols)", () => {
      const seed = { date: new Date(0), sym: Symbol.for("svelte-pbt-large") };
      const a = buildLargeRecord(200, seed);
      const b = buildLargeRecord(200, seed);

      // Add a Symbol-keyed property to ONE side — Object.keys ignores it,
      // so the records still compare equal (locks Inv12 at scale).
      const tagSym = Symbol("hidden-tag");

      b[tagSym] = "extra-meta";

      expect(shallowEqual(a, b)).toBe(true);
    });
  });

  // Closes review §5.5 row 7 (MED, theoretical): Symbol-keyed properties are
  // excluded by `Object.keys()`. shallowEqual iterates Object.keys(prev) —
  // so any Symbol-keyed property on prev OR next is silently ignored. Two
  // records differing ONLY in Symbol-keyed values compare equal. This is a
  // theoretical concern (Params type forbids Symbol keys at compile time),
  // but runtime escape hatches (`as unknown as Params`) could expose it. The
  // lock prevents a future refactor that switched to Reflect.ownKeys() —
  // which would suddenly include Symbol keys and break the documented contract.
  describe("Invariant 12: Symbol-keyed properties are excluded by Object.keys", () => {
    test("symbol-keyed differing values → still equal (Object.keys ignores Symbols)", () => {
      const sym = Symbol("test");
      const a = { x: 1, [sym]: 1 } as Record<string | symbol, unknown>;
      const b = { x: 1, [sym]: 2 } as Record<string | symbol, unknown>;

      // Object.keys excludes Symbol-keyed properties → loop only iterates "x".
      expect(shallowEqual(a, b)).toBe(true);
    });

    test("only symbol-keyed properties on either side → still equal (both look empty)", () => {
      const sym1 = Symbol("a");
      const sym2 = Symbol("b");
      const a = { [sym1]: 1 } as Record<string | symbol, unknown>;
      const b = { [sym2]: 2 } as Record<string | symbol, unknown>;

      // Object.keys returns [] for both → length match → loop is no-op → true.
      expect(shallowEqual(a, b)).toBe(true);
    });

    test("symbol-keyed property added to one side → still equal (no key-count difference visible)", () => {
      const sym = Symbol("test");
      const a = { x: 1 };
      const b = { x: 1, [sym]: "extra" } as Record<string | symbol, unknown>;

      // Object.keys.length is 1 for both — Symbol-keyed properties don't bump the count.
      expect(shallowEqual(a, b)).toBe(true);
    });

    test("Symbol VALUE (not key) on differing side → false (Object.is by reference)", () => {
      // Sanity check: this is the dual case — Symbol as a VALUE (not a key)
      // is compared per Object.is reference semantics, already covered by Inv7
      // but pinned here for contrast with the key case above.
      const sym1 = Symbol("a");
      const sym2 = Symbol("b");

      expect(shallowEqual({ tag: sym1 }, { tag: sym2 })).toBe(false);
      expect(shallowEqual({ tag: sym1 }, { tag: sym1 })).toBe(true);
    });
  });
});
