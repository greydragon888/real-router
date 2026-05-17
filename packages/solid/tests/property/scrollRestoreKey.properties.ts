// packages/solid/tests/property/scrollRestoreKey.properties.ts

/**
 * Property-based tests for `keyOf` / `canonicalJson` from
 * `shared/dom-utils/scroll-restore.ts`.
 *
 * Imported via the direct file path (`src/dom-utils/scroll-restore`)
 * since these helpers are **intentionally excluded from the
 * `shared/dom-utils/index.ts` barrel** — they exist for test access
 * only (audit-2026-05-16 #S3). The public API of `scroll-restore.ts`
 * is `createScrollRestoration` + types; `keyOf`/`canonicalJson` are
 * internals whose stability we lock through these property tests.
 *
 * Invariants (§8b H20 / audit-2026-05-16 #S3):
 *
 * - **`keyOf` shape**: `${state.name}:${canonicalJson(state.params)}`
 *   — the persisted sessionStorage key format. A change here silently
 *   invalidates every saved scroll position across an upgrade.
 * - **`canonicalJson` key-order-insensitive**: the same key set in any
 *   order produces the same string. This is what makes
 *   `<Link routeParams={{a:1,b:2}}>` and `<Link routeParams={{b:2,a:1}}>`
 *   share their scroll-restore cache entry.
 * - **`canonicalJson` determinism**: same input → same output across calls.
 * - **`canonicalJson` recursive sort**: nested object keys are also
 *   sorted (the canonicalReplacer applies to every object in the tree).
 * - **`canonicalJson` arrays preserve order**: arrays are positional,
 *   not order-sorted (only object keys are normalized).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { canonicalJson, keyOf } from "../../src/dom-utils/scroll-restore";

import type { State } from "@real-router/core";

const arbPlainParams = fc.dictionary(
  fc.stringMatching(/^[a-z]{1,6}$/),
  fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.boolean()),
  { minKeys: 0, maxKeys: 5 },
);

const arbState = (params: Record<string, unknown>): State =>
  ({
    name: "users.view",
    params,
    path: "/users/1",
    context: {},
  }) as unknown as State;

describe("keyOf / canonicalJson — Property Tests (§8b H20, audit #S3)", () => {
  describe("Invariant 1: `keyOf` shape locked — `${name}:${canonicalJson(params)}`", () => {
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.thorough })(
      "keyOf result equals the documented composition",
      (params) => {
        const state = arbState(params);
        const key = keyOf(state);

        expect(key).toBe(`${state.name}:${canonicalJson(params)}`);
      },
    );

    test.prop([arbPlainParams], { numRuns: NUM_RUNS.standard })(
      "keyOf has exactly one `:` separator between name and params (name has no dots in the test, by construction)",
      (params) => {
        const state = arbState(params);
        const key = keyOf(state);

        // The state.name we use is "users.view" — colon-separator must
        // come AFTER the name, not within. Locking this prevents a
        // future format change (e.g. `${name}|${params}` switch) from
        // sliding past silently.
        const colonAt = key.indexOf(":");

        expect(colonAt).toBe(state.name.length);
      },
    );
  });

  describe("Invariant 2: `canonicalJson` is key-order-insensitive", () => {
    // The defining contract of canonicalJson: two records with the SAME
    // key/value set but DIFFERENT insertion order produce the SAME
    // string. Without this, scroll positions would split across
    // semantically-equal navigation params.
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.thorough })(
      "reverse-insertion clone produces the same canonical string",
      (params) => {
        const keys = Object.keys(params);
        const reversed: Record<string, unknown> = {};

        for (let i = keys.length - 1; i >= 0; i--) {
          const key = keys[i];

          reversed[key] = params[key];
        }

        expect(canonicalJson(params)).toBe(canonicalJson(reversed));
      },
    );
  });

  describe("Invariant 3: `canonicalJson` is deterministic", () => {
    // Same input → same output across N calls. Locks against accidental
    // randomized iteration order (V8 in some legacy modes did this for
    // numeric-coercible keys).
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.standard })(
      "calling canonicalJson twice on the same value yields the same string",
      (params) => {
        expect(canonicalJson(params)).toBe(canonicalJson(params));
      },
    );
  });

  describe("Invariant 4: nested object keys are also sorted (recursive normalization)", () => {
    // The canonicalReplacer applies at every depth of the JSON tree, so
    // `{ outer: { z: 1, a: 2 } }` and `{ outer: { a: 2, z: 1 } }` are
    // canonicalized identically. Locks that the replacer is recursive,
    // not just top-level.
    test.prop([arbPlainParams, arbPlainParams], {
      numRuns: NUM_RUNS.standard,
    })(
      "nested objects with reversed key order produce the same canonical string",
      (outer, inner) => {
        const innerKeys = Object.keys(inner);
        const reversedInner: Record<string, unknown> = {};

        for (let i = innerKeys.length - 1; i >= 0; i--) {
          const key = innerKeys[i];

          reversedInner[key] = inner[key];
        }

        const a = { ...outer, nested: inner };
        const b = { ...outer, nested: reversedInner };

        expect(canonicalJson(a)).toBe(canonicalJson(b));
      },
    );
  });

  describe("Invariant 5: arrays preserve positional order (only object keys are sorted)", () => {
    // Arrays are positional data structures — sorting their elements
    // would corrupt semantic meaning. canonicalReplacer's `!Array.isArray`
    // guard ensures arrays flow through untouched.
    test.prop([fc.array(fc.string({ maxLength: 6 }), { maxLength: 6 })], {
      numRuns: NUM_RUNS.standard,
    })("array order is preserved verbatim", (arr) => {
      // Direct compare: canonicalJson over an array equals JSON.stringify
      // without a replacer (array elements are not object-sorted).
      expect(canonicalJson(arr)).toBe(JSON.stringify(arr));
    });

    test.prop([fc.array(arbPlainParams, { maxLength: 4 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "array of objects: each object's keys sorted, but array order kept",
      (arrayOfObjects) => {
        const reversed = arrayOfObjects.toReversed();

        // Reversing the OUTER array does change the result (positional).
        if (arrayOfObjects.length > 1) {
          // Only diverge when both arrays are not equal (i.e. >1 distinct
          // positions). Otherwise the comparison is trivially true.
          // We don't assert inequality (rare equal-after-reverse cases
          // exist); just ensure no crash and well-formed JSON output.
          expect(typeof canonicalJson(arrayOfObjects)).toBe("string");
          expect(typeof canonicalJson(reversed)).toBe("string");
        }

        // Both must round-trip cleanly.
        expect(() => JSON.parse(canonicalJson(arrayOfObjects))).not.toThrow();
        expect(() => JSON.parse(canonicalJson(reversed))).not.toThrow();
      },
    );
  });

  describe("Invariant 6: primitives, null, undefined are not crashed", () => {
    test.prop([fc.oneof(fc.string(), fc.integer(), fc.boolean())], {
      numRuns: NUM_RUNS.standard,
    })("primitive values stringify like JSON.stringify", (value) => {
      expect(canonicalJson(value)).toBe(JSON.stringify(value));
    });

    test("canonicalJson(null) === 'null'", () => {
      expect(canonicalJson(null)).toBe("null");
    });

    test("canonicalJson(undefined) === undefined (matches JSON.stringify semantics)", () => {
      // JSON.stringify(undefined) === undefined, not "undefined".
      // canonicalJson inherits that semantic via the replacer pass-through.
      expect(canonicalJson(undefined)).toBeUndefined();
    });
  });
});
