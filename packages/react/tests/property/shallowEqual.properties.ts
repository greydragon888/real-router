// packages/react/tests/property/shallowEqual.properties.ts

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

import { arbExtendedPrimitive, arbExtendedRecord, NUM_RUNS } from "./helpers";
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

  describe("Invariant 6: key-order insensitivity (CLAUDE.md L376)", () => {
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
});
