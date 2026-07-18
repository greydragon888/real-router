import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isPrimitiveValue } from "../../src/is-primitive-value";

// Arbitraries inlined (dissolved from the former type-guards property helpers): a
// valid URL-parameter primitive is a string / finite number / boolean; the invalid
// numeric edges are NaN / ±Infinity.
const primitiveValueArbitrary = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
);
const invalidPrimitiveArbitrary = fc.constantFrom(
  Number.NaN,
  Infinity,
  -Infinity,
);

describe("isPrimitiveValue Properties", () => {
  test.prop([primitiveValueArbitrary], { numRuns: 10_000 })(
    "always returns true for valid primitives",
    (value) => {
      expect(isPrimitiveValue(value)).toBe(true);
    },
  );

  test.prop([invalidPrimitiveArbitrary], { numRuns: 1000 })(
    "always returns false for NaN, Infinity, -Infinity",
    (value) => {
      expect(isPrimitiveValue(value)).toBe(false);
    },
  );

  test.prop(
    [
      fc.oneof(
        fc.constant(null),
        fc.constant(undefined),
        fc.func(fc.anything()),
        fc.constant(Symbol("test")),
      ),
    ],
    { numRuns: 10_000 },
  )("returns false for invalid types", (value) => {
    expect(isPrimitiveValue(value)).toBe(false);
  });

  it("correctly handles 0 and -0", () => {
    expect(isPrimitiveValue(0)).toBe(true);
    expect(isPrimitiveValue(-0)).toBe(true);
  });

  test.prop([fc.integer()], { numRuns: 10_000 })(
    "always returns true for integers",
    (value) => {
      expect(isPrimitiveValue(value)).toBe(true);
    },
  );

  test.prop([fc.double()], { numRuns: 10_000 })(
    "correctly handles float numbers",
    (value) => {
      // Valid only if not NaN/Infinity
      if (Number.isNaN(value) || !Number.isFinite(value)) {
        expect(isPrimitiveValue(value)).toBe(false);
      } else {
        expect(isPrimitiveValue(value)).toBe(true);
      }
    },
  );

  it("determinism for identical values", () => {
    expect(isPrimitiveValue("test")).toBe(true);
    expect(isPrimitiveValue("test")).toBe(true);
    expect(isPrimitiveValue(123)).toBe(true);
    expect(isPrimitiveValue(123)).toBe(true);
  });
});
