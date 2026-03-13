import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { validateParamKey, validateParamValue } from "../../src/validation";

// =============================================================================
// Constants
// =============================================================================

const NUM_RUNS = 200;

// =============================================================================
// Arbitraries
// =============================================================================

const SAFE_CHARS = [
  // eslint-disable-next-line @typescript-eslint/no-misused-spread -- ASCII-only chars, no emoji risk
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.~",
];

const INVALID_CHARS = [
  " ",
  "\t",
  "\n",
  "\r",
  "#",
  "%",
  "&",
  "/",
  "=",
  "?",
  "\\",
];

const arbValidKey = fc.string({
  unit: fc.constantFrom(...SAFE_CHARS),
  minLength: 1,
  maxLength: 20,
});

const arbInvalidKey = fc
  .tuple(
    fc.string({
      unit: fc.constantFrom(...SAFE_CHARS),
      minLength: 0,
      maxLength: 8,
    }),
    fc.constantFrom(...INVALID_CHARS),
    fc.string({
      unit: fc.constantFrom(...SAFE_CHARS),
      minLength: 0,
      maxLength: 8,
    }),
  )
  .map(([prefix, bad, suffix]) => `${prefix}${bad}${suffix}`);

const arbValidValue: fc.Arbitrary<string | number | boolean | undefined> =
  fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.integer({ min: -1_000_000, max: 1_000_000 }),
    fc.boolean(),
    fc.constant(undefined),
  );

const arbInvalidValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.constant(null),
  fc.array(fc.anything(), { maxLength: 3 }),
  fc.dictionary(fc.string({ maxLength: 5 }), fc.string({ maxLength: 5 }), {
    minKeys: 1,
    maxKeys: 3,
  }),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(Number.NEGATIVE_INFINITY),
);

// =============================================================================
// validateParamKey
// =============================================================================

describe("validation: validateParamKey partition property", () => {
  test.prop([arbValidKey], { numRuns: NUM_RUNS })(
    "keys without invalid characters pass validation",
    (key) => {
      expect(() => {
        validateParamKey(key);
      }).not.toThrowError();
    },
  );

  test.prop([arbInvalidKey], { numRuns: NUM_RUNS })(
    "keys containing at least one invalid character throw TypeError",
    (key) => {
      expect(() => {
        validateParamKey(key);
      }).toThrowError(TypeError);
    },
  );
});

// =============================================================================
// validateParamValue
// =============================================================================

describe("validation: validateParamValue partition property", () => {
  test.prop([fc.string({ maxLength: 10 }), arbValidValue], {
    numRuns: NUM_RUNS,
  })("primitive values and undefined pass validation", (key, value) => {
    expect(() => {
      validateParamValue(key, value);
    }).not.toThrowError();
  });

  test.prop([fc.string({ maxLength: 10 }), arbInvalidValue], {
    numRuns: NUM_RUNS,
  })("non-primitive values throw TypeError", (key, value) => {
    expect(() => {
      validateParamValue(key, value);
    }).toThrowError(TypeError);
  });
});
