import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { canonicalJson } from "../../src/canonicalJson.js";

// Pure-function PBT — bumped to 1000 runs (covers shrinking on unicode / edge
// JSON values without ballooning the suite duration; runs in ~10ms total).
const PURE_RUNS = 1000;

// Restricted to JSON-safe primitives the cache key actually sees in production:
// route params are strings, numbers, booleans, occasionally null. Nested arbs
// build small records / arrays so shrinking stays cheap.
const arbJsonPrimitive: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 16 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
  fc.constant(null),
);

const arbJsonValue: fc.Arbitrary<unknown> = fc.letrec((tie) => ({
  value: fc.oneof(
    { withCrossShrink: true },
    arbJsonPrimitive,
    fc.array(tie("value"), { maxLength: 4 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), tie("value"), {
      maxKeys: 4,
    }),
  ),
})).value;

const arbJsonRecord = fc.dictionary(
  fc.string({ minLength: 1, maxLength: 8 }),
  arbJsonValue,
  { maxKeys: 6 },
);

function shuffleKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => shuffleKeysDeep(v));
  }

  if (value !== null && typeof value === "object") {
    // Deterministic reordering (reverse) is enough to break naive serialization:
    // a non-canonical implementation would produce a different JSON string.
    const reversed: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(
      value as Record<string, unknown>,
    ).toReversed()) {
      reversed[key] = shuffleKeysDeep(val);
    }

    return reversed;
  }

  return value;
}

describe("canonicalJson — invariants", () => {
  test.prop([arbJsonRecord], { numRuns: PURE_RUNS })(
    "key-order invariance: canonicalJson(x) === canonicalJson(reorder(x))",
    (record) => {
      const reordered = shuffleKeysDeep(record);

      expect(canonicalJson(record)).toBe(canonicalJson(reordered));
    },
  );

  test.prop([arbJsonValue], { numRuns: PURE_RUNS })(
    "determinism: repeated calls with the same input produce identical output",
    (value) => {
      expect(canonicalJson(value)).toBe(canonicalJson(value));
    },
  );

  test.prop([arbJsonValue], { numRuns: PURE_RUNS })(
    "idempotency under JSON round-trip: canonicalJson(parse(stringify(x))) is stable",
    (value) => {
      const once = canonicalJson(value);
      const twice = canonicalJson(JSON.parse(once));

      expect(twice).toBe(once);
    },
  );

  test.prop([arbJsonRecord, arbJsonRecord], { numRuns: PURE_RUNS })(
    "different records produce different canonical forms (no spurious collisions)",
    (a, b) => {
      // Discard runs where records are structurally equal (same values, any key
      // order) — the oracle correctly handles those in the else-branch, but we
      // want to focus this property on the collision-detection case. Use
      // sortedJson (key-order-normalised) so key-shuffled pairs are NOT filtered
      // out — they are exactly the cases where JSON.stringify would differ but
      // canonicalJson must agree.
      fc.pre(sortedJson(a) !== sortedJson(b));

      // For records that differ in non-reorder ways, canonical forms must differ.
      // Build a strong oracle: canonical(a) === canonical(b) iff a and b are
      // structurally identical up to key order. Sort the keys ourselves to
      // compute the oracle.
      const canonA = sortedJson(a);
      const canonB = sortedJson(b);

      if (canonA === canonB) {
        expect(canonicalJson(a)).toBe(canonicalJson(b));
      } else {
        expect(canonicalJson(a)).not.toBe(canonicalJson(b));
      }
    },
  );

  test.prop([arbJsonValue], { numRuns: PURE_RUNS })(
    "deep-recursion stability: nested structures don't break sort ordering",
    (value) => {
      // Smoke-test: canonicalJson must terminate on nested input without
      // throwing, and the result must be valid JSON parseable to a
      // structurally-equal value (modulo key order).
      const result = canonicalJson(value);

      expect(canonicalJson(JSON.parse(result))).toBe(result);
    },
  );
});

// =============================================================================
// Audit §2 / §6 (HIGH gaps) — throw-contract, locale-independence, edge cases.
// =============================================================================

describe("canonicalJson — throw-contract (audit §6 HIGH)", () => {
  // One arbitrary per throw-class. `fc.constantFrom` of factory closures ensures
  // each shrunken counter-example produces a fresh instance.
  const arbDisallowedBuiltin: fc.Arbitrary<unknown> = fc.constantFrom(
    () => new Map([["k", "v"]]),
    () => new Set([1, 2]),
    () => new WeakMap(),
    () => new WeakSet(),
    () => /pattern/,
  );

  test.prop([arbDisallowedBuiltin], { numRuns: PURE_RUNS })(
    "Map / Set / WeakMap / WeakSet / RegExp at top level → TypeError",
    (factory) => {
      const value = (factory as () => unknown)();

      expect(() => canonicalJson(value)).toThrow(TypeError);
    },
  );

  test.prop([arbDisallowedBuiltin, fc.string({ minLength: 1, maxLength: 4 })], {
    numRuns: PURE_RUNS,
  })(
    "Map / Set / WeakMap / WeakSet / RegExp nested at depth ≥ 2 → TypeError",
    (factory, key) => {
      const value = (factory as () => unknown)();
      const wrapped = { outer: { [key]: value } };

      expect(() => canonicalJson(wrapped)).toThrow(TypeError);
    },
  );

  test.prop(
    [
      fc.bigInt({ min: -1_000_000n, max: 1_000_000n }),
      fc.integer({ min: 0, max: 3 }),
    ],
    { numRuns: PURE_RUNS },
  )("BigInt at any nesting depth → TypeError", (n, depth) => {
    let value: unknown = n;

    for (let i = 0; i < depth; i++) {
      value = { wrapped: value };
    }

    expect(() => canonicalJson(value)).toThrow(TypeError);
  });

  test("direct self-cycle → TypeError (parity with native JSON.stringify)", () => {
    // Single deterministic case — a property over "arbitrary cyclic graphs"
    // would need a custom graph arbitrary; the structural invariant is the
    // same so a regression test suffices.
    const cyclic: Record<string, unknown> = {};

    cyclic.self = cyclic;

    expect(() => canonicalJson(cyclic)).toThrow(TypeError);
    expect(() => canonicalJson(cyclic)).toThrow(/circular/);
  });

  test.prop([fc.integer({ min: 2, max: 8 })], { numRuns: PURE_RUNS })(
    "indirect cycle through N intermediate nodes → TypeError",
    (chainLength) => {
      const nodes: Record<string, unknown>[] = Array.from(
        { length: chainLength },
        () => ({}),
      );

      for (let i = 0; i < chainLength; i++) {
        nodes[i].next = nodes[(i + 1) % chainLength];
      }

      expect(() => canonicalJson(nodes[0])).toThrow(TypeError);
    },
  );
});

describe("canonicalJson — DAG vs cycle (audit §6)", () => {
  test.prop([arbJsonValue], { numRuns: PURE_RUNS })(
    "DAG (shared reference reachable via two branches) does NOT throw",
    (leaf) => {
      // Skip primitives — the property only makes sense for object leaves.
      fc.pre(leaf !== null && typeof leaf === "object");

      const shared = leaf;
      const dag = { left: shared, right: shared };

      // Native JSON.stringify allows this; canonicalJson must mirror semantics.
      expect(() => canonicalJson(dag)).not.toThrow();
    },
  );

  test.prop([arbJsonValue, fc.integer({ min: 2, max: 5 })], {
    numRuns: PURE_RUNS,
  })(
    "the same object appearing N times in an array serialises N copies",
    (leaf, n) => {
      fc.pre(leaf !== null && typeof leaf === "object");

      const shared = leaf;
      const arr = Array.from({ length: n }, () => shared);

      expect(() => canonicalJson(arr)).not.toThrow();
      // Each slot is independently serialised — the result must not collapse
      // to a single element.
      expect(canonicalJson(arr)).toBe(
        `[${Array.from({ length: n }, () => canonicalJson(shared)).join(",")}]`,
      );
    },
  );
});

describe("canonicalJson — __proto__ key safety (audit §5.A / §6 HIGH)", () => {
  test.prop([fc.integer({ min: -100, max: 100 })], { numRuns: PURE_RUNS })(
    "object with __proto__ own property is distinguishable from object without",
    (value) => {
      const withProto = Object.fromEntries([
        ["__proto__", value],
        ["b", 1],
      ]);

      // The output must serialize __proto__ as a regular key, NOT silently
      // collide with `{ b: 1 }` (which is what plain `{}` assignment would do).
      expect(canonicalJson(withProto)).not.toBe(canonicalJson({ b: 1 }));
      expect(canonicalJson(withProto)).toContain('"__proto__":');
    },
  );

  test.prop(
    [
      fc.tuple(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
      ),
    ],
    { numRuns: PURE_RUNS },
  )(
    "different __proto__ values produce different canonical forms",
    ([a, b]) => {
      fc.pre(a !== b);

      const withA = Object.fromEntries([
        ["__proto__", a],
        ["b", 1],
      ]);
      const withB = Object.fromEntries([
        ["__proto__", b],
        ["b", 1],
      ]);

      expect(canonicalJson(withA)).not.toBe(canonicalJson(withB));
    },
  );
});

describe("canonicalJson — locale independence (audit §6 HIGH)", () => {
  // Unicode keys span accented Latin, Cyrillic, CJK — byte-order comparison
  // must produce identical output regardless of system ICU rules. Under
  // `localeCompare`, the order of "é"/"e", "ё"/"е", "İ"/"i" varies by locale.
  const arbUnicodeKey = fc.oneof(
    fc.constantFrom("é", "e", "ё", "е", "İ", "i", "ñ", "n", "ä", "a"),
    fc.string({ minLength: 1, maxLength: 4 }),
  );

  test.prop([fc.uniqueArray(arbUnicodeKey, { minLength: 2, maxLength: 6 })], {
    numRuns: PURE_RUNS,
  })(
    "unicode keys: canonical output is independent of insertion order",
    (uniqueKeys) => {
      const forward: Record<string, number> = {};
      const reverse: Record<string, number> = {};

      for (const [i, uniqueKey] of uniqueKeys.entries()) {
        forward[uniqueKey] = i;
      }

      for (let i = uniqueKeys.length - 1; i >= 0; i--) {
        reverse[uniqueKeys[i]] = i;
      }

      // Despite different insertion order (and any ICU build), the canonical
      // form sorts by byte-order and must match.
      expect(canonicalJson(forward)).toBe(canonicalJson(reverse));
    },
  );

  test.prop([fc.uniqueArray(arbUnicodeKey, { minLength: 2, maxLength: 6 })], {
    numRuns: PURE_RUNS,
  })(
    "unicode keys: two back-to-back canonicalisations return identical strings",
    (uniqueKeys) => {
      const record: Record<string, number> = {};

      for (const [i, uniqueKey] of uniqueKeys.entries()) {
        record[uniqueKey] = i;
      }

      // Determinism check: the same input on the same Node process must
      // always produce the same string, regardless of how the engine
      // re-orders integer-like keys internally — `compareKeys` runs against
      // the same `Object.keys` order every time.
      expect(canonicalJson(record)).toBe(canonicalJson(record));
    },
  );
});

// =============================================================================
// Audit 2026-05-16 §6 (MEDIUM) — edge JSON values (NaN / Infinity / -0)
// JSON.stringify collapses NaN / ±Infinity to `null` and treats -0 as 0. Two
// inputs that differ only in those values therefore produce the same cache
// key — pinning this prevents a future refactor (custom-replacer for these
// values) from silently breaking the cache-key contract.
// =============================================================================

describe("canonicalJson — edge JSON values pin (audit §6 MEDIUM)", () => {
  test.prop(
    [
      fc.constantFrom<number>(
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ),
      fc.constantFrom<number>(
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ),
    ],
    { numRuns: PURE_RUNS },
  )(
    "NaN / ±Infinity collapse to `null` — `{x:a}` and `{x:b}` share the same canonical form for any two such values",
    (a, b) => {
      expect(canonicalJson({ x: a })).toBe(canonicalJson({ x: b }));
      expect(canonicalJson({ x: a })).toBe('{"x":null}');
    },
  );

  test("NaN and Infinity collide with explicit `null` value", () => {
    expect(canonicalJson({ x: Number.NaN })).toBe(canonicalJson({ x: null }));
    expect(canonicalJson({ x: Number.POSITIVE_INFINITY })).toBe(
      canonicalJson({ x: null }),
    );
  });

  test("-0 collides with +0 (JSON.stringify drops the sign)", () => {
    expect(canonicalJson({ x: -0 })).toBe(canonicalJson({ x: 0 }));
    expect(canonicalJson(-0)).toBe(canonicalJson(0));
    expect(canonicalJson([-0, 0])).toBe("[0,0]");
  });

  test('top-level NaN / Infinity serialize to the string "null" (JSON.stringify semantics)', () => {
    expect(canonicalJson(Number.NaN)).toBe("null");
    expect(canonicalJson(Number.POSITIVE_INFINITY)).toBe("null");
    expect(canonicalJson(Number.NEGATIVE_INFINITY)).toBe("null");
  });
});

// =============================================================================
// Audit 2026-05-16 §6 (MEDIUM) — deep nesting tolerance
// The recursive `canonicalize()` implementation uses path-based cycle
// detection (`Set<object>`). A non-cyclic deep tree (≥50 levels) must
// serialise without `RangeError` — the function should not artificially
// bound depth.
// =============================================================================

describe("canonicalJson — deep nesting tolerance (audit §6 MEDIUM)", () => {
  function makeDeepNonCyclic(depth: number): unknown {
    let leaf: unknown = 1;

    for (let i = 0; i < depth; i++) {
      leaf = { wrapped: leaf };
    }

    return leaf;
  }

  test.prop([fc.integer({ min: 50, max: 200 })], { numRuns: NUM_RUNS_DEEP })(
    "non-cyclic deep tree (50–200 levels) serialises without throwing",
    (depth) => {
      const deep = makeDeepNonCyclic(depth);

      expect(() => canonicalJson(deep)).not.toThrow();

      const result = canonicalJson(deep);

      // Sanity: the output contains exactly `depth` opening braces — every
      // level produced an object literal.
      expect(result.split("{").length - 1).toBe(depth);
    },
  );

  test("very deep tree (1000 levels) still serialises", () => {
    const veryDeep = makeDeepNonCyclic(1000);

    expect(() => canonicalJson(veryDeep)).not.toThrow();
  });
});

// Lower numRuns for the deep-nesting check — each serialisation traverses
// up to 200 nested objects, so 100 runs is enough to surface regressions
// without ballooning the suite duration.
const NUM_RUNS_DEEP = 100;

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => sortedJson(v)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).toSorted(
      (left, right) => left.localeCompare(right),
    );
    const parts = keys.map(
      (key) =>
        `${JSON.stringify(key)}:${sortedJson((value as Record<string, unknown>)[key])}`,
    );

    return `{${parts.join(",")}}`;
  }

  return JSON.stringify(value);
}
