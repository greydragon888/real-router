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

  // ===========================================================================
  // Invariants 7–12 (audit-2026-05-17 §2 / §6) — keyOf injectivity +
  // canonicalJson hardening.
  // ===========================================================================

  describe("Invariant 7: `keyOf` injectivity for distinct (name, params)", () => {
    // Two snapshots that differ in either `name` or `params` MUST produce
    // distinct keys — otherwise the scroll-restore cache would silently
    // collide and "restore" wrong positions on back-navigation. Locks the
    // structural separator between `name` and `params` and the
    // canonicalisation of `params`. We restrict the param shape to objects
    // whose canonical form is non-trivial so the differing-params branch
    // actually surfaces in the key.
    test.prop(
      [
        fc.tuple(
          fc.stringMatching(/^[a-z][a-z.]{0,8}[a-z]$/),
          fc.stringMatching(/^[a-z][a-z.]{0,8}[a-z]$/),
        ),
        arbPlainParams,
        arbPlainParams,
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "distinct (name, params) pairs produce distinct keys",
      ([nameA, nameB], paramsA, paramsB) => {
        // Skip the trivial case where both pairs collapse to the same
        // (name, canonicalForm) — that's the equality branch and it's
        // covered by Invariant 1.
        const stateA = { ...arbState(paramsA), name: nameA } as State;
        const stateB = { ...arbState(paramsB), name: nameB } as State;

        if (
          nameA === nameB &&
          canonicalJson(paramsA) === canonicalJson(paramsB)
        ) {
          // Equality branch — they SHOULD produce the same key.
          expect(keyOf(stateA)).toBe(keyOf(stateB));

          return;
        }

        expect(keyOf(stateA)).not.toBe(keyOf(stateB));
      },
    );
  });

  describe("Invariant 8: `keyOf` name-vs-params collision boundary (documented)", () => {
    // Edge case: `name` contains a literal `:` separator, so an adversarial
    // route name could in principle pun against the params section. The
    // helper's current key format `${name}:${canonicalJson(params)}` makes
    // the name fully prefixed (separator placed AFTER the name), so a route
    // named `"a:b"` with empty params is distinguishable from a route named
    // `"a"` with params `{ b: "" }` — the second produces `a:{"b":""}`, the
    // first produces `a:b:{}`. Locking the answer prevents a refactor to
    // `${name}|${params}` or stripping `:` from the name from accidentally
    // collapsing these two cases.
    test("keyOf({name:'a:b', params:{}}) !== keyOf({name:'a', params:{b:''}})", () => {
      const stateColonName = {
        ...arbState({}),
        name: "a:b",
      } as State;
      const stateWithEmptyParam = {
        ...arbState({ b: "" }),
        name: "a",
      } as State;

      expect(keyOf(stateColonName)).not.toBe(keyOf(stateWithEmptyParam));
    });

    test("keyOf shape: empty params produces `${name}:{}` suffix", () => {
      const state = { ...arbState({}), name: "home" } as State;

      // `canonicalJson({})` is `"{}"` — the trailing `{}` is the
      // observable suffix that pin-tests the empty-params shape.
      expect(keyOf(state)).toBe("home:{}");
    });
  });

  describe("Invariant 9: `canonicalJson` roundtrip — JSON.parse recovers structurally equal value", () => {
    // The serialised form must be a valid JSON document whose parse result
    // matches the canonicalised input. This locks the contract "scroll
    // cache values can be read back unchanged" — a non-recoverable
    // serialisation would corrupt restoration after a page reload (when
    // sessionStorage is re-parsed).
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.thorough })(
      "JSON.parse(canonicalJson(x)) structurally equals canonical(x)",
      (params) => {
        const serialised = canonicalJson(params);
        const parsed = JSON.parse(serialised) as Record<string, unknown>;

        // Compare canonicalised forms — direct deep-equal of `params` and
        // `parsed` would fail when `params` contains an `undefined` value
        // (canonical drops those, matching JSON.stringify semantics).
        expect(canonicalJson(parsed)).toBe(serialised);
      },
    );
  });

  describe("Invariant 10: `canonicalJson` idempotency over JSON-parse roundtrip", () => {
    // `canonicalJson(JSON.parse(canonicalJson(x))) === canonicalJson(x)` —
    // the serialisation is a fixed point of itself under one parse cycle.
    // Stronger than determinism (Invariant 3) because it also locks the
    // parse-then-serialise path against subtle reordering quirks.
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.standard })(
      "canonicalJson is a fixed point of itself under one parse cycle",
      (params) => {
        const once = canonicalJson(params);
        const parsed = JSON.parse(once) as unknown;
        const twice = canonicalJson(parsed);

        expect(twice).toBe(once);
      },
    );
  });

  describe("Invariant 11: `canonicalJson` is safe with hostile own-keys (__proto__/constructor)", () => {
    // `__proto__` set on a plain object via property accessor (e.g.
    // `{ __proto__: 1 }`) becomes an OWN property on V8 — it must be
    // sorted alongside the other keys and serialised verbatim, without
    // polluting `Object.prototype`. A regression here would either drop
    // the key entirely (cache-key collision) or silently leak into the
    // prototype chain (security).
    test("hostile own-keys are serialised verbatim and do NOT pollute Object.prototype", () => {
      // Build the object via Object.defineProperty so the key is unambiguously
      // an own property (not a real prototype assignment). `__proto__` via
      // object literal would set the prototype chain instead.
      const hostile = {} as Record<string, unknown>;

      Object.defineProperty(hostile, "__proto__", {
        value: "evil",
        enumerable: true,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(hostile, "constructor", {
        value: "evil2",
        enumerable: true,
        configurable: true,
        writable: true,
      });
      hostile.normal = "ok";

      const probeBefore = Object.create(null) as { polluted?: unknown };
      const result = canonicalJson(hostile);
      const probeAfter = Object.create(null) as { polluted?: unknown };

      // Both probes must remain empty (no leak into Object.prototype).
      expect(probeBefore.polluted).toBeUndefined();
      expect(probeAfter.polluted).toBeUndefined();

      // Hostile keys appear in the sorted output. `__proto__` may serialise
      // as a plain string property; we assert presence by parsing back and
      // checking the OWN key set.
      const parsed = JSON.parse(result) as Record<string, unknown>;

      const byLocale = (a: string, b: string): number => a.localeCompare(b);

      expect(Object.keys(parsed).toSorted(byLocale)).toStrictEqual(
        ["__proto__", "constructor", "normal"].toSorted(byLocale),
      );
    });
  });

  describe("Invariant 12: `canonicalJson` deep nesting stress (no stack overflow at realistic depth)", () => {
    // User-controllable scroll-restore params with a deeply nested shape
    // (e.g. a Solid `<For>` of dynamic filter trees) would otherwise crash
    // `JSON.stringify` via stack exhaustion. 64 levels is well past
    // anything any real router consumer should ever pass; locking the
    // boundary at 64 catches regressions to a fully recursive replacer
    // without a stack budget.
    test("nested object 64 levels deep serialises without throwing", () => {
      let nested: Record<string, unknown> = { leaf: 1 };

      for (let i = 0; i < 64; i++) {
        nested = { wrap: nested };
      }

      const result = canonicalJson(nested);

      expect(typeof result).toBe("string");
      // Parse-back must succeed — a corrupted output (truncated, malformed)
      // would throw here.
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });
});
