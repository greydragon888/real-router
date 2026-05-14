import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { canonicalJson } from "../../src/canonicalJson.js";

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
  test.prop([arbJsonRecord], { numRuns: NUM_RUNS.standard })(
    "key-order invariance: canonicalJson(x) === canonicalJson(reorder(x))",
    (record) => {
      const reordered = shuffleKeysDeep(record);

      expect(canonicalJson(record)).toBe(canonicalJson(reordered));
    },
  );

  test.prop([arbJsonValue], { numRuns: NUM_RUNS.standard })(
    "determinism: repeated calls with the same input produce identical output",
    (value) => {
      expect(canonicalJson(value)).toBe(canonicalJson(value));
    },
  );

  test.prop([arbJsonValue], { numRuns: NUM_RUNS.standard })(
    "idempotency under JSON round-trip: canonicalJson(parse(stringify(x))) is stable",
    (value) => {
      const once = canonicalJson(value);
      const twice = canonicalJson(JSON.parse(once));

      expect(twice).toBe(once);
    },
  );

  test.prop([arbJsonRecord, arbJsonRecord], { numRuns: NUM_RUNS.standard })(
    "different records produce different canonical forms (no spurious collisions)",
    (a, b) => {
      // Discard runs where the records happen to be structurally equal —
      // canonicalJson must collide on those by definition.
      fc.pre(JSON.stringify(a) !== JSON.stringify(b) || hasKeyShuffle(a, b));

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

  test.prop([arbJsonValue], { numRuns: NUM_RUNS.standard })(
    "deep-recursion stability: nested structures don't break sort ordering",
    (value) => {
      // Smoke-test: canonicalJson must terminate on nested input without
      // throwing, and the result must be valid JSON parseable to a
      // structurally-equal value (modulo key order).
      const result = canonicalJson(value);

      expect(typeof result).toBe("string");
      expect(canonicalJson(JSON.parse(result))).toBe(result);
    },
  );
});

function hasKeyShuffle(a: unknown, b: unknown): boolean {
  // Returns true when JSON.stringify orders are different (i.e., key order
  // matters for naive comparison) — needed to skip discard for records that
  // differ purely by key ordering.
  return JSON.stringify(a) !== JSON.stringify(b);
}

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
