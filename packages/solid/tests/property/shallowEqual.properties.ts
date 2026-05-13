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
      { numRuns: NUM_RUNS.standard },
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
});
