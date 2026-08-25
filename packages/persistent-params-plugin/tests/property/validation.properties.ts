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

/**
 * The one charset-legal name the validator refuses anyway (#1810): the router
 * never publishes it into a state channel, so a persistent param called it can
 * never reach a URL.
 *
 * ⚠ Excluded from `arbValidKey` rather than left to chance. `fast-check` biases
 * its string generator toward exactly this literal — it produced `"__proto__"`
 * on run 156 of 200 the first time this partition ran against the refusal — so
 * the domain is not "narrowed for a hypothetical", it was actively wrong.
 */
const REFUSED_PUBLISHABLE_KEY = "__proto__";

const arbValidKey = fc
  .string({
    unit: fc.constantFrom(...SAFE_CHARS),
    minLength: 1,
    maxLength: 20,
  })
  .filter((key) => key !== REFUSED_PUBLISHABLE_KEY);

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
      }).not.toThrow();
    },
  );

  test.prop([arbValidKey], { numRuns: NUM_RUNS })(
    "the refused name is the ONLY charset-legal key that throws",
    (key) => {
      // The sister of the partition above, and what keeps its `.filter` honest:
      // without it, widening the refusal to a second name would silently shrink
      // the generator instead of failing anything.
      expect(() => {
        validateParamKey(key);
      }).not.toThrow();

      expect(() => {
        validateParamKey(REFUSED_PUBLISHABLE_KEY);
      }).toThrow(TypeError);
    },
  );

  test.prop([arbInvalidKey], { numRuns: NUM_RUNS })(
    "keys containing at least one invalid character throw TypeError",
    (key) => {
      expect(() => {
        validateParamKey(key);
      }).toThrow(TypeError);
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
    }).not.toThrow();
  });

  test.prop([fc.string({ maxLength: 10 }), arbInvalidValue], {
    numRuns: NUM_RUNS,
  })("non-primitive values throw TypeError", (key, value) => {
    expect(() => {
      validateParamValue(key, value);
    }).toThrow(TypeError);
  });
});
