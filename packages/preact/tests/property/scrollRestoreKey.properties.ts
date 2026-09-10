// packages/preact/tests/property/scrollRestoreKey.properties.ts

/**
 * Property-based tests for `keyOf(state)` + `canonicalJson(value)` from
 * `shared/dom-utils/scroll-restore.ts` (review §6 N3).
 *
 * `keyOf(state)` produces the storage key under which scroll positions are
 * cached in `sessionStorage`. It names a LOCATION: it reads `state.path`, the
 * form core prints the current URL in (#1923).
 *
 * ⚑ Both helpers are imported from the module under test, not replicated here.
 * The replica this file used to carry drifted the moment the key changed and
 * kept passing — it was measuring itself. `keyOf` and `canonicalJson` are
 * exported from `scroll-restore.ts` for exactly this, and the direct path
 * reaches them without going through the barrel.
 *
 * ⚠ `canonicalJson` is NOT the scroll key. It is a sorted-key serializer this
 * module exports, and the invariants below are its own.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { canonicalJson, keyOf } from "../../src/dom-utils/scroll-restore";

import type { State } from "@real-router/core";

// =============================================================================
// Arbitraries
// =============================================================================

// Param keys: lowercase letters / digits, length 1–6. Wide enough to surface
// sort regressions across the alphabet (locale-sensitive sort would shuffle
// digits vs. letters differently from default).
const arbParamKey = fc.stringMatching(/^[a-z0-9]{1,6}$/);

const arbParamValue = fc.oneof(
  fc.string({ minLength: 0, maxLength: 8 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

const arbParams = fc.dictionary(arbParamKey, arbParamValue, {
  minKeys: 0,
  maxKeys: 6,
});

const arbRouteName: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 4 })
  .map((segments) => segments.join("."));

/**
 * A state whose printed path is derived from the bags, the way core prints one:
 * the query in sorted order, so the same location written two ways prints once.
 */
function asState(name: string, params: Record<string, unknown>): State {
  const query = Object.keys(params)
    .toSorted((left, right) => left.localeCompare(right))
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");

  return {
    name,
    params,
    search: {},
    path: query ? `/${name}?${query}` : `/${name}`,
  } as unknown as State;
}

// =============================================================================
// Tests
// =============================================================================

describe("scroll-restore keyOf / canonicalJson — Property Tests", () => {
  describe("Invariant 1: determinism — same input yields the same key", () => {
    // The scroll-restore subscribeLeave path calls keyOf at save time;
    // mount restore calls keyOf at load time. If the two invocations
    // produced different strings for the same logical state, the saved
    // position would never be found on the way back — silent UX regression.
    test.prop([arbRouteName, arbParams], { numRuns: NUM_RUNS.thorough })(
      "keyOf(state) === keyOf(state) across calls",
      (name, params) => {
        const state = asState(name, params);

        expect(keyOf(state)).toBe(keyOf(state));
      },
    );
  });

  describe("Invariant 2: the key IS the printed path", () => {
    // Not "derived from it" — equal to it. Any transformation would be a
    // second place that has to know how a location prints, which is the whole
    // defect #1923 closed.
    test.prop([arbRouteName, arbParams], { numRuns: NUM_RUNS.thorough })(
      "keyOf(state) === state.path",
      (name, params) => {
        const state = asState(name, params);

        expect(keyOf(state)).toBe(state.path);
      },
    );
  });

  describe("Invariant 3: location-injectivity — different path → different key", () => {
    // Two locations must NEVER share a scroll bucket — otherwise navigating
    // from `/users` (scrolled 800px) to `/posts` (scrolled 0) and back to
    // `/users` could restore the wrong position.
    test.prop([arbRouteName, arbRouteName, arbParams], {
      numRuns: NUM_RUNS.thorough,
    })("path !== path' ⇒ keyOf(state) !== keyOf(state')", (a, b, params) => {
      fc.pre(a !== b);

      expect(keyOf(asState(a, params))).not.toBe(keyOf(asState(b, params)));
    });

    // The converse, and it is deliberate: two states that print one URL share
    // one bucket, whatever their bags hold. That is the #1923 trade — the
    // functional suite (`scroll-restore-key-1923.test.ts`) owns the case it
    // exists for, a <Link>'s `"2"` and a URL's parsed `2`.
    test("two states printing one path share one bucket", () => {
      const fromLink = {
        name: "docs",
        params: { page: "2" },
        path: "/docs?page=2",
      };
      const fromUrl = {
        name: "docs",
        params: { page: 2 },
        path: "/docs?page=2",
      };

      expect(keyOf(fromLink as unknown as State)).toBe(
        keyOf(fromUrl as unknown as State),
      );
    });
  });

  describe("Invariant 4: canonicalJson totality — never throws on plain params", () => {
    // A sorted-key serializer is only useful if it is total over the inputs a
    // caller can hand it; a throw would surface in the consumer's app.
    test.prop([arbParams], { numRuns: NUM_RUNS.thorough })(
      "canonicalJson is total over plain {string: primitive} params",
      (params) => {
        expect(() => canonicalJson(params)).not.toThrow();
      },
    );
  });

  describe("Invariant 5: key-order insensitivity", () => {
    // Its defining property: the same object written two ways serializes once.
    test.prop([arbParams, fc.integer({ min: 0, max: 1 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "canonicalJson(params) === canonicalJson(shuffled(params))",
      (params, seed) => {
        const keys = Object.keys(params);
        const ordered = seed % 2 === 0 ? keys : keys.toReversed();
        const shuffled: Record<string, unknown> = {};

        for (const key of ordered) {
          shuffled[key] = params[key];
        }

        expect(canonicalJson(shuffled)).toBe(canonicalJson(params));
      },
    );
  });

  describe("Invariant 6: shallow scope — only top-level keys are sorted", () => {
    // The canonicalReplacer sorts each object encountered, so nested objects
    // are also sorted. Lock that behaviour: a nested {b:2, a:1} must serialize
    // identically to {a:1, b:2}.
    test("nested objects also get key-sorted (replacer recurses)", () => {
      const a = canonicalJson({ outer: { b: 2, a: 1 } });
      const b = canonicalJson({ outer: { a: 1, b: 2 } });

      expect(a).toBe(b);
    });

    // Arrays preserve insertion order (replacer skips arrays).
    test("arrays preserve insertion order (not sorted)", () => {
      expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    });
  });
});
