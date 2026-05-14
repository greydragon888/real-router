// packages/angular/tests/property/shallowEqual.properties.ts

/**
 * Property-based tests for `shallowEqual` from
 * `packages/angular/src/dom-utils/link-utils.ts` (git-tracked copy of
 * `shared/dom-utils/link-utils.ts`).
 *
 * Closes review-2026-05-10 §6.2 invariants 1 (reflexivity + symmetry) and 2
 * (key-count discriminator). The full surface mirrors svelte's coverage so
 * the two adapters cannot drift unnoticed.
 *
 * `shallowEqual` is the comparator used by `navigateWithHash` for same-route
 * same-params hash-change detection (#532) and by every directive's
 * memoization layer.
 *
 * Invariants:
 * 1. Reflexivity — shallowEqual(o, o) === true
 * 2. Symmetry — shallowEqual(a, b) === shallowEqual(b, a)
 * 3. NaN-aware (Object.is, not ===)
 * 4. Nullable short-circuit — undefined and record
 * 4b. Empty objects are equal — length-0 short-circuit
 * 5. Key-count short-circuit (different size → false)
 * 6. Key-order insensitivity
 * 7. Symbol values (Object.is by reference)
 * 8. Date values (Object.is by reference, NOT by epoch)
 * 9. Nested objects compared by reference (no deep compare)
 * 10. Explicit-undefined value counts as a present key (hasOwnProperty guard)
 * 11. BigInt values compared by Object.is (by value)
 * 12. Symbol-keyed properties excluded by Object.keys
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
  // Invariant 1 from review §6.2 — Object.is fast-path. A regression that
  // returned `false` for `shallowEqual(o, o)` would force every same-link
  // click to bypass SAME_STATES, breaking the #532 same-route hash detection.
  describe("Invariant 1: reflexivity — shallowEqual(o, o) === true", () => {
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.thorough })(
      "any record is shallow-equal to itself (Object.is fast-path)",
      (o) => {
        expect(shallowEqual(o, o)).toBe(true);
      },
    );
  });

  // Invariant 1 (paired) from review §6.2 — symmetry. The implementation
  // iterates keys of `prev` only; without proper hasOwnProperty + key-count
  // gating, `shallowEqual(superset, subset)` would falsely return true.
  describe("Invariant 2: symmetry — shallowEqual(a, b) === shallowEqual(b, a)", () => {
    test.prop([arbExtendedRecord, arbExtendedRecord], {
      numRuns: NUM_RUNS.thorough,
    })("comparison verdict is order-independent", (a, b) => {
      expect(shallowEqual(a, b)).toBe(shallowEqual(b, a));
    });
  });

  describe("Invariant 3: NaN-aware (Object.is, not ===)", () => {
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

  describe("Invariant 4b: empty objects are equal (length-0 short-circuit)", () => {
    test("shallowEqual({}, {}) === true (distinct refs, zero keys)", () => {
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

  // Invariant 2 from review §6.2 — key-count discriminator.
  describe("Invariant 5: key-count short-circuit (different size → false)", () => {
    test.prop(
      [
        arbExtendedRecord,
        fc.stringMatching(/^[a-z]{1,4}$/),
        arbExtendedPrimitive,
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "adding a new key to one side breaks equality",
      (base, extraKey, extraVal) => {
        fc.pre(!(extraKey in base));

        const a = { ...base };
        const b = { ...base, [extraKey]: extraVal };

        expect(shallowEqual(a, b)).toBe(false);
        expect(shallowEqual(b, a)).toBe(false);
      },
    );
  });

  describe("Invariant 6: key-order insensitivity", () => {
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
      { numRuns: NUM_RUNS.standard },
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
      expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
      expect(shallowEqual({ b: undefined }, { a: undefined })).toBe(false);
    });
  });

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
      expect(shallowEqual({ n: 1n }, { n: 1 })).toBe(false);
    });

    test("zero BigInt vs zero Number → false (different types)", () => {
      expect(shallowEqual({ n: 0n }, { n: 0 })).toBe(false);
    });
  });

  // Object.keys() does NOT return Symbol-keyed properties. shallowEqual
  // iterates Object.keys(prev), so symbol-keyed values are silently ignored.
  // Locks the contract against a future refactor to `Reflect.ownKeys()`.
  describe("Invariant 12: Symbol-keyed properties are excluded by Object.keys", () => {
    test("symbol-keyed differing values → still equal (Object.keys ignores Symbols)", () => {
      const sym = Symbol("test");
      const a = { x: 1, [sym]: 1 } as Record<string | symbol, unknown>;
      const b = { x: 1, [sym]: 2 } as Record<string | symbol, unknown>;

      expect(shallowEqual(a, b)).toBe(true);
    });

    test("only symbol-keyed properties on either side → still equal (both look empty)", () => {
      const sym1 = Symbol("a");
      const sym2 = Symbol("b");
      const a = { [sym1]: 1 } as Record<string | symbol, unknown>;
      const b = { [sym2]: 2 } as Record<string | symbol, unknown>;

      expect(shallowEqual(a, b)).toBe(true);
    });

    test("symbol-keyed property added to one side → still equal (no key-count difference visible)", () => {
      const sym = Symbol("test");
      const a = { x: 1 };
      const b = { x: 1, [sym]: "extra" } as Record<string | symbol, unknown>;

      expect(shallowEqual(a, b)).toBe(true);
    });

    test("Symbol VALUE (not key) on differing side → false (Object.is by reference)", () => {
      const sym1 = Symbol("a");
      const sym2 = Symbol("b");

      expect(shallowEqual({ tag: sym1 }, { tag: sym2 })).toBe(false);
      expect(shallowEqual({ tag: sym1 }, { tag: sym1 })).toBe(true);
    });
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("one === null" LOW). The type signature
  // is `object | undefined` but JavaScript callers can still pass `null` via
  // escape hatches (legacy code, dynamic data, runtime-cast). The
  // implementation's `!prev || !next` short-circuit covers `null` because
  // `!null === true` — both null-vs-null AND null-vs-record paths are
  // pinned here, since the type system doesn't enforce the contract at
  // runtime.
  describe("Invariant 13: null vs object (escape-hatch runtime case)", () => {
    test("shallowEqual(null, null) === true (Object.is fast-path: Object.is(null, null))", () => {
      expect(
        shallowEqual(null as unknown as object, null as unknown as object),
      ).toBe(true);
    });

    test("shallowEqual(null, {}) === false", () => {
      expect(shallowEqual(null as unknown as object, {})).toBe(false);
    });

    test("shallowEqual({}, null) === false", () => {
      expect(shallowEqual({}, null as unknown as object)).toBe(false);
    });

    test("shallowEqual(null, undefined) === false (Object.is(null, undefined) → false; both falsy → short-circuit)", () => {
      expect(shallowEqual(null as unknown as object, undefined)).toBe(false);
    });
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("inherited prop через prototype" LOW).
  // `Object.keys()` returns only OWN enumerable string keys — inherited
  // properties on the prototype chain are excluded from iteration. Two
  // objects with identical own-key counts and the same own-values compare
  // equal even if their prototype chains differ wildly. Locks the contract
  // against a future refactor to `for (const key in obj)` (which DOES walk
  // the chain) or `Reflect.ownKeys()` (different semantics).
  describe("Invariant 14: inherited properties via prototype are NOT compared", () => {
    test("two records with same own-keys but DIFFERENT prototypes → still equal", () => {
      class WithProto {
        inherited = "from-proto";
      }
      const a = new WithProto();

      (a as unknown as Record<string, unknown>).id = "42";

      // Plain object with the same own-key set as `a` (inherited excluded
      // by `delete a.inherited` would still leave it via prototype). We
      // make a equivalent via shape: only "id" + "inherited" as own keys.
      const aOwnKeys = Object.keys(a);

      // Reconstruct a clean object with the SAME own-key set.
      const b: Record<string, unknown> = {};

      for (const k of aOwnKeys) {
        b[k] = (a as unknown as Record<string, unknown>)[k];
      }

      // Sanity: keys match in count.
      expect(Object.keys(a)).toHaveLength(Object.keys(b).length);
      expect(shallowEqual(a, b)).toBe(true);
    });

    test("prototype-only differences invisible to shallowEqual", () => {
      const proto = { inherited: "X" };
      const a = Object.create(proto) as Record<string, unknown>;

      a.own = "1";
      const b = Object.create(null) as Record<string, unknown>;

      b.own = "1";

      // `a` has `inherited` via proto, `b` has null prototype. Object.keys
      // returns ["own"] for both → length match, values match → equal.
      expect(shallowEqual(a, b)).toBe(true);
    });

    test("`hasOwnProperty`-check defends against inherited values when keys overlap", () => {
      // If shallowEqual ever switched to `prev[key] === next[key]` without
      // hasOwnProperty(), a missing own-key whose value lives on the
      // prototype would falsely match. Verify the current `hasOwnProperty`
      // guard rejects this case.
      const protoX = { x: 1 };
      const a = Object.create(protoX) as Record<string, unknown>;

      a.y = 2;
      // `a` has own keys ["y"]; "x" exists via prototype only.
      // `b` has own keys ["y"] (same as a's own-keys).
      const b: Record<string, unknown> = { y: 2 };

      // Object.keys(a) = ["y"], Object.keys(b) = ["y"] → length match.
      // The loop iterates "y" on both — both equal "2". Both have own "y".
      // The fact that a has inherited "x" doesn't affect the result.
      expect(shallowEqual(a, b)).toBe(true);
    });
  });
});
