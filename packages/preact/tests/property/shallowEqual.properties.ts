// packages/preact/tests/property/shallowEqual.properties.ts

/**
 * Property-based tests for `shallowEqual` from `shared/dom-utils/link-utils.ts`.
 *
 * The function is the comparator used by `areLinkPropsEqual` for `routeParams`
 * and `routeOptions`. It must hold:
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
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbDate,
  arbDeepRecord,
  arbExtendedPrimitive,
  arbExtendedRecord,
  NUM_RUNS,
  SYMBOL_A,
  SYMBOL_B,
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

  describe("Invariant 5: key-count short-circuit", () => {
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

  describe("Invariant 6: key-order insensitivity (CLAUDE.md L222-235)", () => {
    // Documented public contract: `{a:1, b:2}` ≡ `{b:2, a:1}`.
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.thorough })(
      "reversing key insertion order does not change equality",
      (o) => {
        const keys = Object.keys(o);

        // Reverse-insertion clone to force a different internal key order.
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
    // objects — `Object.is` returns false. This locks the documented
    // shallowEqual contract: no value-equality fast path for Date.
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
    // Documented gotcha in CLAUDE.md "Object Params and Memoization": nested
    // objects with identical contents but distinct refs → re-render.
    // shallowEqual MUST return false for these — consumers stabilize via
    // useMemo when they want deep equality.
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

        // Top-level keys match (1 vs 1); nested values are === by structure
        // but !== by reference. Object.is(a.nested, b.nested) === false.
        expect(shallowEqual(a, b)).toBe(false);
      },
    );

    test.prop([fc.integer({ min: -1000, max: 1000 })], {
      numRuns: NUM_RUNS.standard,
    })("same nested-object ref shared between both sides → true", (x) => {
      const sharedNested = { x };
      const a = { nested: sharedNested };
      const b = { nested: sharedNested };

      // Same outer-key set, same nested ref → Object.is per key passes.
      expect(shallowEqual(a, b)).toBe(true);
    });
  });

  describe("Invariant 10: explicit-undefined value counts as a present key", () => {
    // Documented gotcha (review §5.5): `{ a:1, b:undefined }` and `{ a:1 }`
    // are NOT shallow-equal — `Object.keys` includes own-properties whose value
    // is `undefined`, so the length-mismatch short-circuit fires. This can
    // surface as unwanted Link re-renders when a consumer toggles an optional
    // field between absent and explicitly-undefined.
    test.prop([arbExtendedRecord, fc.stringMatching(/^[a-z]{1,4}$/)], {
      numRuns: NUM_RUNS.standard,
    })(
      "adding an explicit-undefined key to one side breaks equality",
      (base, extraKey) => {
        fc.pre(!(extraKey in base));

        const a = { ...base };
        const b = { ...base, [extraKey]: undefined };

        expect(shallowEqual(a, b)).toBe(false);
        // Symmetry: superset-on-either-side fails.
        expect(shallowEqual(b, a)).toBe(false);
      },
    );

    test("locks documented case: shallowEqual({a:1, b:undefined}, {a:1}) === false", () => {
      // Reified single example covers the exact value pair quoted in the
      // CLAUDE.md gotcha — regression-test for anyone tempted to "fix" the
      // length comparison by filtering undefined values.
      expect(shallowEqual({ a: 1, b: undefined }, { a: 1 })).toBe(false);
      expect(shallowEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    });
  });

  describe("Invariant 11: prototype-pollution lock — inherited keys do not count as own", () => {
    // The implementation uses `Object.prototype.hasOwnProperty.call(next, key)`
    // for each key from `prev`. A regression to plain `key in next` would
    // accept inherited properties — so an object with `own=1` would falsely
    // match a record that inherits `own` from a prototype rather than owning
    // it directly. `arbParams`/`arbExtendedRecord` only generate
    // `[a-z]{1,4}` keys, so they never exercise this path — the lock is
    // intentionally a reified example covering the prototype chain.
    test("inherited key on one side does NOT match own key on the other", () => {
      const inheriting: Record<string, unknown> = Object.create({ shared: 1 });

      inheriting.own = 1;

      const owning = { own: 1, shared: 1 };

      expect(shallowEqual(inheriting, owning)).toBe(false);
      expect(shallowEqual(owning, inheriting)).toBe(false);
    });
  });
});
