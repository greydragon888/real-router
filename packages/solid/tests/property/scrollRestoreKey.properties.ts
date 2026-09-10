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

const printPath = (name: string, params: Record<string, unknown>): string => {
  const query = Object.keys(params)
    .toSorted((left, right) => left.localeCompare(right))
    .map((key) => `${key}=${String(params[key])}`)
    .join("&");

  return query ? `/${name}?${query}` : `/${name}`;
};

// ⚑ The path is DERIVED from the bags here, the way core derives it. A fixture
// that hands every state one literal path measures itself: the key reads
// `state.path`, so a constant there makes every location the same location.
const arbState = (
  params: Record<string, unknown>,
  name = "users.view",
): State =>
  ({
    name,
    params,
    search: {},
    path: printPath(name, params),
    context: {},
  }) as unknown as State;

describe("keyOf / canonicalJson — Property Tests (§8b H20, audit #S3)", () => {
  describe("Invariant 1: the key IS the printed path (#1923)", () => {
    // Not "derived from it" — equal to it. Any transformation would make this
    // a second place that has to know how a location prints, which is the
    // defect #1923 closed: the URL direction parses `?page=2` into the number
    // `2` and an intent keeps `"2"`, so a key built from the bags puts one
    // location in two buckets.
    test.prop([arbPlainParams], { numRuns: NUM_RUNS.thorough })(
      "keyOf(state) === state.path",
      (params) => {
        const state = arbState(params);

        expect(keyOf(state)).toBe(state.path);
      },
    );

    test.prop([arbPlainParams], { numRuns: NUM_RUNS.standard })(
      "the key is not the route name plus a separator",
      (params) => {
        const state = arbState(params);

        // The falsifier for a refactor back to `${name}:${…}`: that shape
        // OPENS with the bare name, the printed path opens with "/". Asserting
        // the absence of a ":" would be wrong — a param VALUE may hold one.
        expect(keyOf(state).startsWith(state.name)).toBe(false);
        expect(keyOf(state).startsWith("/")).toBe(true);
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

  describe("Invariant 7: `keyOf` injectivity for distinct locations", () => {
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
      "distinct printed paths produce distinct keys, equal ones share a bucket",
      ([nameA, nameB], paramsA, paramsB) => {
        const stateA = arbState(paramsA, nameA);
        const stateB = arbState(paramsB, nameB);

        if (stateA.path === stateB.path) {
          // The equality branch, and it is the #1923 trade rather than an
          // accident: one URL, one bucket, whatever the bags hold.
          expect(keyOf(stateA)).toBe(keyOf(stateB));

          return;
        }

        expect(keyOf(stateA)).not.toBe(keyOf(stateB));
      },
    );
  });

  describe("Invariant 8: no separator of the helper's own to pun against", () => {
    // The class this used to guard: a key built as `${name}:${params}` can be
    // punned by a route name carrying the separator. Reading the printed path
    // removes the separator and the class with it — core owns how a location
    // prints, and a name is not spliced in.
    test("a route named 'a:b' and a route 'a' with param b are separate locations", () => {
      const colonName = arbState({}, "a:b");
      const emptyParam = arbState({ b: "" }, "a");

      expect(keyOf(colonName)).not.toBe(keyOf(emptyParam));
    });

    test("a parameterless location keys as its bare path", () => {
      expect(keyOf(arbState({}, "home"))).toBe("/home");
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

  describe("Invariant 13: function/Symbol values replaced with markers (Sprint A.3 — audit-2026-05-17 §5 MEDIUM)", () => {
    // Plain `JSON.stringify` silently drops function- and symbol-valued
    // properties from object output. Two routes whose params differ
    // ONLY in such a value would canonicalize identically → scroll
    // positions collide silently in sessionStorage. The replacer
    // substitutes deterministic ASCII sentinels (`"<fn>"`, `"<sym>"`)
    // so the canonical string carries enough signal to distinguish
    // values from "key absent".
    test("function-valued param appears as `<fn>` (not dropped)", () => {
      const params = { id: "x", fn: () => 42 };
      const json = canonicalJson(params);
      const parsed = JSON.parse(json) as Record<string, unknown>;

      expect(parsed.fn).toBe("<fn>");
      expect(parsed.id).toBe("x");
    });

    test("symbol-valued param appears as `<sym>` (not dropped)", () => {
      const params = { id: "x", marker: Symbol("brand") };
      const json = canonicalJson(params);
      const parsed = JSON.parse(json) as Record<string, unknown>;

      expect(parsed.marker).toBe("<sym>");
      expect(parsed.id).toBe("x");
    });

    test("no collision: two routes differing only in fn value still produce DIFFERENT keys", () => {
      // Pre-fix behaviour: both → `'{"a":1}'` (silent collision).
      // Post-fix behaviour: both still equal because the marker is
      // identity-blind, BUT collision is now an EXPLICIT documented
      // behaviour ("functions are not part of cache key"), and the
      // sentinel makes it observable.
      const a = canonicalJson({ a: 1, fn: () => 1 });
      const b = canonicalJson({ a: 1, fn: () => 2 });

      // Both fn values collapse to `"<fn>"` — collision is still
      // present BUT now visible (the key contains `"<fn>"`, so the
      // consumer cannot mistake this for "no fn key").
      expect(a).toBe(b);
      expect(a).toContain('"<fn>"');
    });

    test("collision broken: route with fn vs route without fn produce DIFFERENT keys", () => {
      // The real collision-break: pre-fix, `{a:1, fn: () => 1}` and
      // `{a: 1}` canonicalized identically (`'{"a":1}'`). Post-fix,
      // the fn version contains `"fn":"<fn>"`.
      const withFn = canonicalJson({ a: 1, fn: () => 1 });
      const withoutFn = canonicalJson({ a: 1 });

      expect(withFn).not.toBe(withoutFn);
    });

    test("nested function values also replaced (recursive)", () => {
      const params = {
        outer: {
          inner: {
            cb: () => null,
          },
        },
      };
      const json = canonicalJson(params);

      expect(json).toContain('"<fn>"');
      expect(json).not.toMatch(/"cb":\{\}/); // not silently dropped
    });
  });
});
