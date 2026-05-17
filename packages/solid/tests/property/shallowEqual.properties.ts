// packages/solid/tests/property/shallowEqual.properties.ts

/**
 * Property-based tests for `shallowEqual` from `shared/dom-utils/link-utils.ts`.
 *
 * Solid adapter uses `shallowEqual` indirectly via `navigateWithHash` (same-
 * route detection on Link click) and may add new consumers — keeping the
 * test set symmetric with React guards against silent regressions in the
 * shared symlink.
 *
 * Invariants:
 *
 * - **Reflexivity:** `shallowEqual(o, o) === true` (Object.is fast-path).
 * - **Symmetry:** `shallowEqual(a, b) === shallowEqual(b, a)`.
 * - **NaN-aware:** uses `Object.is`, not `===`. `Object.is(NaN, NaN) === true`,
 *   `Object.is(+0, -0) === false`. Strict equality (`===`) would invert both.
 * - **Nullable short-circuit:** `(undefined, {})` and `({}, undefined)` are
 *   both `false`. Without the check, the loop would NPE.
 * - **Key-count short-circuit:** different `Object.keys.length` → immediate
 *   `false` without iterating values.
 * - **Key-order insensitivity:** `{a:1, b:2}` and `{b:2, a:1}` are equal.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbExtendedPrimitive,
  arbExtendedRecord,
  arbHostileParams,
  NUM_RUNS,
} from "./helpers";
import { shallowEqual } from "../../src/dom-utils";

describe("shallowEqual — Property Tests (Solid)", () => {
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
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.elevated })(
      "NaN values compare equal across distinct objects",
      (base) => {
        const a = { ...base, n: Number.NaN };
        const b = { ...base, n: Number.NaN };

        expect(shallowEqual(a, b)).toBe(true);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.elevated })(
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
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.elevated })(
      "shallowEqual(undefined, record) === false (no NPE)",
      (o) => {
        expect(shallowEqual(undefined, o)).toBe(false);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.elevated })(
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
      { numRuns: NUM_RUNS.elevated },
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
    // Public contract: `{a:1, b:2}` ≡ `{b:2, a:1}`.
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

  describe("Invariant 7: hostile keys are treated as ordinary string keys", () => {
    // Real-world params may legitimately carry `__proto__` / dotted /
    // empty / Unicode keys. The implementation guards with
    // `Object.prototype.hasOwnProperty.call(next, key)` so a key missing in
    // `next` does NOT silently match `prev[key] === undefined` through the
    // prototype chain. This invariant pins that defense.
    test.prop([arbHostileParams], { numRuns: NUM_RUNS.thorough })(
      "self-comparison holds for any hostile-key params dict",
      (params) => {
        expect(shallowEqual(params, params)).toBe(true);
      },
    );

    test.prop([arbHostileParams, arbHostileParams], {
      numRuns: NUM_RUNS.thorough,
    })("symmetry holds for hostile-key params dicts", (a, b) => {
      expect(shallowEqual(a, b)).toBe(shallowEqual(b, a));
    });

    test("missing own `__proto__` key is NOT confused with prototype lookup", () => {
      // The implementation's `hasOwnProperty` guard prevents the value loop
      // from silently reading `next.__proto__` (a getter on
      // `Object.prototype`) when `__proto__` is an own key on `prev` only.
      // Force an own `__proto__` key on `a` via `Reflect.defineProperty`
      // (object literals special-case the name to set the prototype).
      const a: Record<string, unknown> = {};

      Reflect.defineProperty(a, "__proto__", {
        value: "polluted",
        enumerable: true,
        writable: true,
        configurable: true,
      });

      const b: Record<string, unknown> = {};

      // sanity: a has its own __proto__ key, b does not
      expect(Object.prototype.hasOwnProperty.call(a, "__proto__")).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(b, "__proto__")).toBe(false);

      expect(shallowEqual(a, b)).toBe(false);
      expect(shallowEqual(b, a)).toBe(false);
    });
  });

  describe("Invariant 8: transitivity — a≡b ∧ b≡c ⇒ a≡c (§6.4 №9)", () => {
    // Required for a well-formed equivalence relation. A regression that
    // breaks transitivity (e.g. value-comparison that depends on key
    // iteration order or insertion timing) silently breaks
    // `navigateWithHash`'s same-route detection — a click might trigger
    // a redundant transition because the stored params object is
    // "shallow-equal but not transitively so" to the new one.
    test.prop([arbExtendedRecord, arbExtendedRecord, arbExtendedRecord], {
      numRuns: NUM_RUNS.thorough,
    })("transitivity holds across three records", (a, b, c) => {
      if (shallowEqual(a, b) && shallowEqual(b, c)) {
        expect(shallowEqual(a, c)).toBe(true);
      }
    });
  });

  describe("Invariant 8a: BigInt edge cases (§2.3 audit)", () => {
    // arbExtendedPrimitive includes 1n / -1n / 0n, but these are uniformly
    // sampled across the entire value space, so back-to-back BigInt pairs
    // are statistically rare. This invariant exercises the exact BigInt
    // collision cases that matter: 1n vs 1n (Object.is true), -1n vs 1n
    // (false), 0n vs 0n (true). A regression that mishandles BigInt
    // (e.g. converts to Number) would silently break params with id: 0n.
    test("BigInt values: Object.is(1n, 1n) → shallowEqual true", () => {
      const a: Record<string, unknown> = { id: 1n };
      const b: Record<string, unknown> = { id: 1n };

      expect(shallowEqual(a, b)).toBe(true);
    });

    test("BigInt values: Object.is(0n, -0n) → shallowEqual true (no signed-zero)", () => {
      // Unlike Number, BigInt has no -0n distinct from 0n.
      const a: Record<string, unknown> = { id: 0n };
      const b: Record<string, unknown> = { id: -0n };

      expect(shallowEqual(a, b)).toBe(true);
    });

    test("BigInt values: 1n vs -1n → shallowEqual false", () => {
      const a: Record<string, unknown> = { id: 1n };
      const b: Record<string, unknown> = { id: -1n };

      expect(shallowEqual(a, b)).toBe(false);
    });

    test("BigInt vs Number with same magnitude: 1n vs 1 → shallowEqual false (no coercion)", () => {
      // Object.is(1n, 1) === false. shallowEqual must NOT silently coerce
      // BigInt to Number — params with id: 1n vs id: 1 are distinct values
      // (different runtime types) and a regression that coerces would
      // mask a real difference.
      const a: Record<string, unknown> = { id: 1n };
      const b: Record<string, unknown> = { id: 1 };

      expect(shallowEqual(a, b)).toBe(false);
    });
  });

  describe("Invariant 9: shallow-clone equivalence — shallowEqual(o, {...o}) === true", () => {
    // Very common production pattern: spreading params into a fresh object
    // before passing to navigate(). The clone has different identity but
    // the same own enumerable keys with the same values — must compare
    // equal. Pinned here because a regression that swaps `Object.is` for
    // `===` would break NaN cases inside the spread.
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.thorough })(
      "an object is shallow-equal to its own spread clone",
      (o) => {
        expect(shallowEqual(o, { ...o })).toBe(true);
        expect(shallowEqual({ ...o }, o)).toBe(true);
      },
    );
  });

  describe("Invariant 10: cyclic objects do not cause infinite recursion (§2.3 audit)", () => {
    // shallowEqual compares ONE level deep — it MUST NOT walk into values.
    // A regression that introduced deep equality would stack-overflow on
    // cyclic structures (e.g. params: { self: <ref to params> }). Real
    // params rarely cycle, but framework wrappers occasionally pass DOM
    // refs or store proxies that hold cycles. Lock the no-recursion
    // contract here so any "let's add deep-compare" refactor fails fast.
    test("self-cyclic record is shallow-equal to itself (Object.is fast-path)", () => {
      const a: Record<string, unknown> = {};

      a.self = a;

      // Reflexivity short-circuit: Object.is(a, a) === true.
      expect(() => shallowEqual(a, a)).not.toThrow();
      expect(shallowEqual(a, a)).toBe(true);
    });

    test("two structurally-identical cyclic records are shallow-equal (Object.is on value)", () => {
      // Both `a` and `b` hold a self-reference. shallowEqual iterates keys
      // and applies `Object.is(a.self, b.self)` — since `a.self === a`
      // and `b.self === b` and `a !== b`, the value comparison fails →
      // false. Lock the answer so a future "add cycle detection" change
      // doesn't silently flip to true.
      const a: Record<string, unknown> = {};

      a.self = a;
      const b: Record<string, unknown> = {};

      b.self = b;

      expect(() => shallowEqual(a, b)).not.toThrow();
      expect(shallowEqual(a, b)).toBe(false);
    });

    test("cross-referenced records do not crash shallowEqual", () => {
      // `a.ref = b` and `b.ref = a`. The keys match, the values compared
      // are `Object.is(b, a)` and `Object.is(a, b)` — both false because
      // a !== b. Result is true OR false depending on key sets — we only
      // care that no infinite recursion occurs.
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};

      a.ref = b;
      b.ref = a;

      expect(() => shallowEqual(a, b)).not.toThrow();
      // Both have one own key `ref`, but `Object.is(b, a)` is false →
      // shallowEqual returns false. Lock the answer.
      expect(shallowEqual(a, b)).toBe(false);
    });
  });

  describe("Invariant 11: undefined values vs missing keys at same length (§5.4 edge-case)", () => {
    // The dangerous edge: two records with the SAME number of own keys,
    // BUT one of those keys is missing on one side and present (with
    // undefined value) on the other. A naive implementation that compares
    // `prev[key] === next[key]` without a `hasOwnProperty` guard would
    // silently match `undefined === undefined` and return true.
    //
    // shallowEqual must answer FALSE in this case — the records are
    // structurally different, even though every value pair is `undefined`.
    // Production impact: `navigateWithHash`'s same-params detection would
    // miss a real param-key change if this collapsed to true, causing
    // skipped re-renders.
    test("{ a: undefined, b: 1 } and { c: undefined, b: 1 } compare as NOT equal", () => {
      const a: Record<string, unknown> = { a: undefined, b: 1 };
      const b: Record<string, unknown> = { c: undefined, b: 1 };

      // Sanity: both records have the same key-count (key-count short-circuit
      // would NOT fire here — the loop must reach the per-key compare).
      expect(Object.keys(a)).toHaveLength(2);
      expect(Object.keys(b)).toHaveLength(2);

      // Without `hasOwnProperty.call(next, key)`, the loop would lookup
      // `b['a']` → undefined and match `a['a']` → undefined silently.
      // The guard breaks that — final answer must be false (symmetric).
      expect(shallowEqual(a, b)).toBe(false);
      expect(shallowEqual(b, a)).toBe(false);
    });

    test("{ a: undefined } and { a: undefined } DO compare equal (same key, same value)", () => {
      // Control case for the negative above — when the key IS owned by
      // both sides AND the value is `undefined`, shallowEqual must answer
      // true (Object.is(undefined, undefined) === true, hasOwnProperty
      // returns true for both).
      const a: Record<string, unknown> = { a: undefined };
      const b: Record<string, unknown> = { a: undefined };

      expect(shallowEqual(a, b)).toBe(true);
    });
  });
});
