import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { extractOwnParams, mergeParams } from "../../src/param-utils";

import type { Params } from "@real-router/core";

// =============================================================================
// Constants
// =============================================================================

const NUM_RUNS = 200;

// =============================================================================
// Arbitraries
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only chars, no emoji risk
const ALPHA = [..."abcdefghijklmnopqrstuvwxyz"];

const arbKey = fc.string({
  unit: fc.constantFrom(...ALPHA),
  minLength: 1,
  maxLength: 8,
});

const arbPrimitive: fc.Arbitrary<string | number | boolean> = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.integer({ min: -1000, max: 1000 }),
  fc.boolean(),
);

const arbValue: fc.Arbitrary<string | number | boolean | undefined> = fc.oneof(
  arbPrimitive,
  fc.constant(undefined),
);

const arbParams = fc.dictionary(arbKey, arbValue, {
  minKeys: 0,
  maxKeys: 5,
}) as fc.Arbitrary<Params>;

const arbDefinedParams = fc.dictionary(arbKey, arbPrimitive, {
  minKeys: 0,
  maxKeys: 5,
}) as fc.Arbitrary<Readonly<Params>>;

// =============================================================================
// Merge Semantics
// =============================================================================

describe("merge semantics: mergeParams algebraic properties", () => {
  test.prop([arbDefinedParams], { numRuns: NUM_RUNS })(
    "merging with empty current returns persistent unchanged",
    (persistent) => {
      const result = mergeParams(persistent, {});

      const expected: Record<string, unknown> = {};

      for (const key of Object.keys(persistent)) {
        if (persistent[key] !== undefined) {
          expected[key] = persistent[key];
        }
      }

      expect(result).toStrictEqual(expected);
    },
  );

  test.prop([arbDefinedParams, arbDefinedParams], { numRuns: NUM_RUNS })(
    "current value overrides persistent for overlapping keys",
    (persistent, current) => {
      const result = mergeParams(persistent, current);

      for (const key of Object.keys(current)) {
        if (current[key] !== undefined) {
          expect(result[key]).toBe(current[key]);
        }
      }
    },
  );

  test.prop([arbDefinedParams, arbKey], { numRuns: NUM_RUNS })(
    "undefined in current removes the key from result",
    (persistent, key) => {
      const result = mergeParams(persistent, { [key]: undefined } as Params);

      expect(result).not.toHaveProperty(key);
    },
  );

  test.prop([arbDefinedParams, arbParams], { numRuns: NUM_RUNS })(
    "neither input object is mutated",
    (persistent, current) => {
      const persistentEntries = Object.entries(persistent);
      const currentEntries = Object.entries(current);

      mergeParams(persistent, current);

      expect(Object.entries(persistent)).toStrictEqual(persistentEntries);
      expect(Object.entries(current)).toStrictEqual(currentEntries);
    },
  );
});

// =============================================================================
// Own-Property Extraction
// =============================================================================

describe("own-property extraction: extractOwnParams guarantees", () => {
  test.prop([arbParams], { numRuns: NUM_RUNS })(
    "extracting twice produces the same result as extracting once",
    (params) => {
      const once = extractOwnParams(params);
      const twice = extractOwnParams(once);

      expect(twice).toStrictEqual(once);
    },
  );

  test.prop([arbParams], { numRuns: NUM_RUNS })(
    "result contains exactly the own enumerable properties with identical values",
    (params) => {
      const result = extractOwnParams(params);

      const ownKeys = Object.keys(params).filter((k) =>
        Object.hasOwn(params, k),
      );

      expect(
        Object.keys(result).toSorted((a, b) => a.localeCompare(b)),
      ).toStrictEqual(ownKeys.toSorted((a, b) => a.localeCompare(b)));

      for (const key of ownKeys) {
        expect(result[key]).toBe(params[key]);
      }
    },
  );
});
