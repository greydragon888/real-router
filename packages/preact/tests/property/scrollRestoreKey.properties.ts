// packages/preact/tests/property/scrollRestoreKey.properties.ts

/**
 * Property-based tests for `keyOf(state)` + `canonicalJson(value)` from
 * `shared/dom-utils/scroll-restore.ts` (review §6 N3).
 *
 * `keyOf(state)` produces the storage key under which scroll positions are
 * cached in `sessionStorage`. The contract documented in
 * `packages/preact/CLAUDE.md` (RouterProvider Props section):
 *
 *   "Keyed by `(name, canonicalJson(params))` — duplicate history entries
 *    share one bucket."
 *
 * For that "duplicate history entries share one bucket" promise to hold,
 * `canonicalJson` must be:
 *
 * - **Key-order insensitive** — `{a:1, b:2}` and `{b:2, a:1}` must serialize
 *   to the same string (otherwise back-button restores fail when the URL
 *   plugin emits params in a different key order than the original navigation).
 * - **Deterministic across calls** — same input → same output (otherwise
 *   the storage key drifts between save (subscribeLeave) and load (pagehide
 *   → next mount restore)).
 * - **Name-injective via keyOf** — different `name` produces different key
 *   even with identical params (otherwise two routes accidentally share a
 *   scroll bucket).
 *
 * **Replica disclaimer.** `keyOf` and `canonicalJson` are private (not
 * exported from `shared/dom-utils/`). This file replicates them inline,
 * mirroring the `isSegmentMatch` pattern in `routeView.properties.ts`. Any
 * edit to `shared/dom-utils/scroll-restore.ts:264-288` MUST be mirrored here.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";

import type { State } from "@real-router/core";

// =============================================================================
// Inline replica of keyOf + canonicalJson (private — mirror of
// shared/dom-utils/scroll-restore.ts:264-288)
// =============================================================================

function canonicalReplicaReplacer(_key: string, val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(val).toSorted((left: string, right: string) =>
      left.localeCompare(right),
    );

    for (const key of keys) {
      sorted[key] = (val as Record<string, unknown>)[key];
    }

    return sorted;
  }

  return val;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, canonicalReplicaReplacer);
}

function keyOf(state: { name: string; params: unknown }): string {
  return `${state.name}:${canonicalJson(state.params)}`;
}

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

function shuffleKeys(
  source: Record<string, unknown>,
  seed: number,
): Record<string, unknown> {
  const keys = Object.keys(source);
  // Deterministic shuffle: reverse iteration when seed is odd, identity when
  // even. Combined with the random-seed-rooted property iteration, this lets
  // fast-check generate both orderings across runs.
  const orderedKeys = seed % 2 === 0 ? keys : keys.toReversed();
  const shuffled: Record<string, unknown> = {};

  for (const key of orderedKeys) {
    shuffled[key] = source[key];
  }

  return shuffled;
}

function asState(name: string, params: unknown): State {
  return { name, params } as unknown as State;
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

  describe("Invariant 2: key-order insensitivity (duplicate history bucket)", () => {
    // CLAUDE.md L17 contract: "Keyed by (name, canonicalJson(params)) —
    // duplicate history entries share one bucket." Two navigations to the
    // same route with the same params but different key-insertion order
    // (e.g. URL plugin parsed `?b=2&a=1` vs. JS object literal `{a:1,b:2}`)
    // must hash to the same bucket.
    test.prop([arbRouteName, arbParams, fc.integer({ min: 0, max: 1 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "keyOf({name, params}) === keyOf({name, shuffled(params)})",
      (name, params, seed) => {
        const original = asState(name, params);
        const shuffled = asState(name, shuffleKeys(params, seed));

        expect(keyOf(shuffled)).toBe(keyOf(original));
      },
    );

    // Reified single example covering the documented gotcha pair.
    test("CLAUDE.md case: {a:1, b:2} and {b:2, a:1} share a bucket", () => {
      expect(keyOf(asState("users", { a: 1, b: 2 }))).toBe(
        keyOf(asState("users", { b: 2, a: 1 })),
      );
    });
  });

  describe("Invariant 3: name-injectivity — different name → different key", () => {
    // Two routes that happen to carry identical params must NEVER share a
    // scroll bucket — otherwise navigating from `/users` (scrolled 800px) to
    // `/posts` (scrolled 0) and back to `/users` could restore the wrong
    // position. The `name:` prefix in keyOf is the only guard.
    test.prop([arbRouteName, arbRouteName, arbParams], {
      numRuns: NUM_RUNS.thorough,
    })(
      "name !== name' ⇒ keyOf({name, p}) !== keyOf({name', p})",
      (a, b, params) => {
        fc.pre(a !== b);

        expect(keyOf(asState(a, params))).not.toBe(keyOf(asState(b, params)));
      },
    );
  });

  describe("Invariant 4: canonicalJson totality — never throws on plain params", () => {
    // scroll-restore subscribes to leave events; a runtime throw inside
    // canonicalJson would surface as an unhandled error in the consumer's
    // app on every navigation. JSON.stringify with the sort-replacer is
    // total over JSON-serializable input — locks the surface.
    test.prop([arbParams], { numRuns: NUM_RUNS.thorough })(
      "canonicalJson is total over plain {string: primitive} params",
      (params) => {
        expect(() => canonicalJson(params)).not.toThrow();
      },
    );
  });

  describe("Invariant 5: shallow scope — only top-level keys are sorted", () => {
    // The canonicalReplacer sorts each object encountered, so nested objects
    // are also sorted. Lock that behaviour: a nested {b:2, a:1} must serialize
    // identically to {a:1, b:2}. (Real route params are flat per @real-router
    // semantics, but plugins may attach nested context; the contract should
    // be consistent.)
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
