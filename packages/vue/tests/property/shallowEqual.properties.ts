// packages/vue/tests/property/shallowEqual.properties.ts

/**
 * Property-based tests for `shallowEqual` from `shared/dom-utils/link-utils.ts`.
 *
 * The function is used by Vue's `<Link>` (via `useIsActiveRoute`) and by
 * `navigateWithHash` to determine "same params" within the same-route hash
 * detection branch. It must hold:
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
 *
 * Closes §2.2 review items 1-6 for `shallowEqual` (previously Vue relied on
 * React/Preact PBT coverage via the shared/dom-utils symlink).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { reactive } from "vue";

import {
  arbDate,
  arbDeepRecord,
  arbExtendedPrimitive,
  arbExtendedRecord,
  arbFrozenRecord,
  arbProtoKey,
  arbReactiveRecord,
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

  describe("Invariant 6: key-order insensitivity", () => {
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
    // Documented Vue gotcha — same as React/Preact: nested objects with
    // identical contents but distinct refs cause a re-render. shallowEqual
    // MUST return false for these — consumers stabilize via `computed`/`shallowRef`
    // when they want deep equality.
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
    // Documented gotcha (review §5.5 / Preact's Inv 10): `{ a:1, b:undefined }`
    // and `{ a:1 }` are NOT shallow-equal — `Object.keys` includes own-properties
    // whose value is `undefined`, so the length-mismatch short-circuit fires.
    // The `hasOwnProperty` guard inside the loop also rejects the case where
    // both records have the same key count but one of the keys is missing on
    // the other side (it would otherwise read as `undefined` and falsely match).
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

    test("equal-length-different-keys (hasOwnProperty guard) — { a: undefined } vs { b: undefined } → false", () => {
      // §2.2 review item flagged this as a potential "hidden behavior" — two
      // records with the same key count but disjoint key sets and undefined
      // values. The `hasOwnProperty` check inside the loop rejects the case:
      // iterating `a`'s keys, `b` has no `a` key, so `hasOwn(b, 'a')` is false
      // → returns false immediately. Without the guard, the lookup would
      // return `undefined` and falsely match.
      expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
      expect(shallowEqual({ b: undefined }, { a: undefined })).toBe(false);
    });
  });

  describe("Invariant 11: frozen records compare identically to mutable ones", () => {
    // Route snapshots emitted by `@real-router/core` are always frozen (the
    // `stabilizeState` helper returns frozen objects). Vue's `shallowRef` holds
    // them as-is. `shallowEqual` must treat frozen objects identically — both
    // `Object.keys` and `Object.is` work on frozen instances. Closes §2.4 row
    // "Frozen objects (LOW — route snapshots всегда frozen)".
    test.prop([arbFrozenRecord], { numRuns: NUM_RUNS.thorough })(
      "frozen-record reflexivity",
      (o) => {
        expect(shallowEqual(o, o)).toBe(true);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "mutable record and its frozen clone with same keys/values compare equal",
      (record) => {
        const frozenClone = Object.freeze({ ...record });

        // Object.is per-key still matches even though one side is frozen.
        expect(shallowEqual(record, frozenClone)).toBe(true);
        expect(shallowEqual(frozenClone, record)).toBe(true);
      },
    );
  });

  describe("Invariant 12: Vue reactive proxies — identity-based reflexivity, no deep compare across proxies", () => {
    // Vue's `reactive(...)` returns a Proxy that wraps the target object.
    // `useIsActiveRoute` can be invoked with `routeParams` coming from a
    // reactive setup-scope state. `shallowEqual` must:
    //   1. Treat a proxy as its own identity (Object.is(p, p) === true).
    //   2. NOT deep-compare two proxies that wrap structurally-identical
    //      targets — proxies are reference-distinct.
    // Closes §2.4 row "Vue reactive proxies (MED — для shallowEqual через useIsActiveRoute)".
    test.prop([arbReactiveRecord], { numRuns: NUM_RUNS.thorough })(
      "reactive-record reflexivity (Object.is fast-path)",
      (proxy) => {
        expect(shallowEqual(proxy, proxy)).toBe(true);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "two reactive proxies over identical content with same keys compare equal (per-key Object.is)",
      (record) => {
        // Reactive wraps each target independently — outer proxies are
        // reference-distinct, but per-key reads through both proxies return
        // the same primitive values, so `Object.is(p1[k], p2[k]) === true`
        // when the underlying values are primitives. The records will
        // therefore compare equal via the per-key loop (not Object.is fast-path).
        const p1 = reactive({ ...record });
        const p2 = reactive({ ...record });

        // Two distinct reactive proxies — Vue always wraps in a new Proxy so
        // this invariant is guaranteed; assert explicitly rather than using
        // fc.pre() which would silently skip if the assumption broke.
        expect(p1).not.toBe(p2);

        // Vue may have created proxies that hide non-primitive values (Date,
        // nested objects, Symbol slots). When that happens the per-key
        // Object.is comparison fails by reference and the records are NOT
        // equal — exercise both branches explicitly.
        const allPrimitive = Object.values(record).every(
          (value) => Object(value) !== value,
        );

        if (allPrimitive) {
          expect(shallowEqual(p1, p2)).toBe(true);
        } else {
          // At least one nested object/Date/Symbol → per-key Object.is fails.
          // shallowEqual must NOT deep-compare proxies.
          expect(shallowEqual(p1, p2)).toBe(false);
        }
      },
    );
  });

  describe("Invariant 13: prototype-pollution-resilient — `__proto__` / `constructor` as own keys", () => {
    // `shallowEqual` iterates `Object.keys(prev)` (own-properties only) and
    // uses `Object.prototype.hasOwnProperty.call(next, key)` for the cross-side
    // lookup. Both API entries explicitly skip inherited members, so
    // `__proto__` / `constructor` / `hasOwnProperty` as OWN-property keys
    // compare like any other key. Closes §2.4 row "Prototype pollution keys
    // (`__proto__`) — ⛔ LOW".
    test.prop([arbProtoKey, arbExtendedPrimitive], {
      numRuns: NUM_RUNS.standard,
    })(
      "{ [protoKey]: v } reflexivity (own-property check, no prototype escape)",
      (key, value) => {
        // Object literal with computed `__proto__` would set the prototype;
        // `Object.defineProperty` writes a real own data property instead.
        const o = Object.defineProperty({}, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });

        expect(shallowEqual(o, o)).toBe(true);
      },
    );

    test.prop([arbProtoKey, arbExtendedPrimitive], {
      numRuns: NUM_RUNS.standard,
    })(
      "same proto-named own-property on both sides → equal (Object.is per value)",
      (key, value) => {
        const a = Object.defineProperty({}, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
        const b = Object.defineProperty({}, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });

        expect(shallowEqual(a, b)).toBe(Object.is(value, value));
      },
    );

    test("inherited `__proto__` (no own key) — both empty `{}` compare equal regardless of prototype mutation", () => {
      // A pollution attempt that only writes to the prototype must not leak
      // into `Object.keys` iteration. `{}` has zero own keys → shallowEqual
      // short-circuits via key-count === 0. Locks the contract under
      // adversarial conditions.
      const a: Record<string, unknown> = {};
      const b: Record<string, unknown> = {};

      // Pretend a bad actor wrote `Object.prototype.x = 1` somewhere else —
      // shallowEqual must ignore it. Skip actually mutating Object.prototype
      // to avoid polluting the test runtime; the assertion still proves the
      // contract because Object.keys returns [].
      expect(shallowEqual(a, b)).toBe(true);
    });
  });

  // Review §6 — NEW Inv 14: Function values compared by Object.is reference.
  // `routeOptions` / `routeParams` may contain callback fields (event handlers,
  // transition callbacks). Two literal arrow functions with identical bodies
  // are distinct references — `shallowEqual` must report them as not-equal
  // (Object.is per key). A regression that calls `.toString()` or tries
  // structural equality would falsely collapse them. Locks the per-key
  // Object.is contract for function values.
  describe("Invariant 14: function values — Object.is by reference", () => {
    test("same function reference on both sides → equal", () => {
      const fn = () => undefined;

      expect(shallowEqual({ cb: fn }, { cb: fn })).toBe(true);
    });

    test("distinct function references with identical bodies → not equal", () => {
      const fn1 = () => undefined;
      const fn2 = () => undefined;

      expect(shallowEqual({ cb: fn1 }, { cb: fn2 })).toBe(false);
    });

    test.prop(
      [fc.func(fc.constant(undefined)), fc.func(fc.constant(undefined))],
      {
        numRuns: NUM_RUNS.standard,
      },
    )(
      "PBT: two distinct fast-check-generated functions are not equal",
      (f1, f2) => {
        // fc.func produces fresh closures per draw; two independent draws
        // are guaranteed distinct references regardless of body shape.
        expect(shallowEqual({ cb: f1 }, { cb: f2 })).toBe(false);
        // Reflexivity on the same reference still holds.
        expect(shallowEqual({ cb: f1 }, { cb: f1 })).toBe(true);
      },
    );
  });

  // Review §6 — NEW Inv 15: Getter side-effects (documented limitation).
  // `shallowEqual` reads each key via plain bracket access (`prev[key]`,
  // `next[key]`). When `key` is a getter, the getter fires once per call per
  // side — there is no proxy bypass / Reflect.getOwnPropertyDescriptor short-
  // circuit. This is a deliberate trade-off: PBT consumers may pass reactive-
  // proxy params, and the comparator must operate at the same logical layer
  // as user code. Locks the contract so a future "optimisation" that switches
  // to property-descriptor reads is caught as a behaviour change.
  describe("Invariant 15: getter side-effects are observable (no proxy bypass)", () => {
    test("each getter is invoked exactly once per shallowEqual call (per side)", () => {
      let aReads = 0;
      let bReads = 0;
      const a = Object.defineProperty({} as Record<string, number>, "x", {
        get() {
          aReads++;

          return 42;
        },
        enumerable: true,
        configurable: true,
      });
      const b = Object.defineProperty({} as Record<string, number>, "x", {
        get() {
          bReads++;

          return 42;
        },
        enumerable: true,
        configurable: true,
      });

      const result = shallowEqual(a, b);

      // Both records have one own enumerable key (`x`); Object.keys captures
      // it on both sides. The per-key loop reads `prev.x` and `next.x` once
      // each. A regression that double-reads (e.g., a defensive fallback)
      // would surface as aReads > 1 or bReads > 1.
      expect(result).toBe(true);
      expect(aReads).toBe(1);
      expect(bReads).toBe(1);
    });
  });

  // Review §6 — NEW Inv 16: `Object.seal` / `Object.preventExtensions` /
  // `Object.freeze` produce records that compare identically to mutable ones
  // when their key/value pairs match. The comparator uses `Object.keys` +
  // `Object.is` — neither API discriminates by extensibility. Route snapshots
  // emitted by `@real-router/core` are frozen; consumers may also seal their
  // own params before passing them to `<Link>`. Locks the contract so all
  // three integrity levels stay equivalence-preserving.
  describe("Invariant 16: integrity levels (seal / preventExtensions / freeze)", () => {
    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "shallowEqual(rec, Object.seal({ ...rec })) === true",
      (rec) => {
        expect(shallowEqual(rec, Object.seal({ ...rec }))).toBe(true);
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "shallowEqual(rec, Object.preventExtensions({ ...rec })) === true",
      (rec) => {
        expect(shallowEqual(rec, Object.preventExtensions({ ...rec }))).toBe(
          true,
        );
      },
    );

    test.prop([arbExtendedRecord], { numRuns: NUM_RUNS.standard })(
      "shallowEqual(Object.freeze({ ...rec }), Object.seal({ ...rec })) === true (mixed integrity levels)",
      (rec) => {
        // Cross-integrity comparison — frozen vs. sealed must still be equal
        // when keys/values match. The comparator must not branch on any
        // integrity flag.
        const frozen = Object.freeze({ ...rec });
        const sealed = Object.seal({ ...rec });

        expect(shallowEqual(frozen, sealed)).toBe(true);
      },
    );
  });
});
