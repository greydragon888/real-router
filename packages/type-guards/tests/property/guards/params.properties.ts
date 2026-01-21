import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isParams, isParamsStrict } from "type-guards";

import {
  paramsSimpleArbitrary,
  paramsWithArraysArbitrary,
  paramsNestedArbitrary,
  invalidParamsArbitrary,
  arbitraryInvalidTypes,
} from "../helpers";

describe("Params Type Guards Properties", () => {
  describe("isParams", () => {
    test.prop([paramsSimpleArbitrary], { numRuns: 10_000 })(
      "always returns true for simple valid Params",
      (params) => {
        expect(isParams(params)).toBe(true);

        return true;
      },
    );

    test.prop([paramsWithArraysArbitrary], { numRuns: 10_000 })(
      "always returns true for Params with arrays",
      (params) => {
        expect(isParams(params)).toBe(true);

        return true;
      },
    );

    test.prop([paramsNestedArbitrary], { numRuns: 3000 })(
      "always returns true for nested Params",
      (params) => {
        expect(isParams(params)).toBe(true);

        return true;
      },
    );

    it("returns true for empty object", () => {
      expect(isParams({})).toBe(true);

      return true;
    });

    test.prop([invalidParamsArbitrary], { numRuns: 10_000 })(
      "returns false for invalid Params with NaN/Infinity/functions",
      (params) => {
        // Invalid params should be rejected
        expect(isParams(params)).toBe(false);

        return true;
      },
    );

    test.prop([arbitraryInvalidTypes], { numRuns: 10_000 })(
      "returns false for primitives and non-objects",
      (value) => {
        expect(isParams(value)).toBe(false);

        return true;
      },
    );

    test.prop([paramsSimpleArbitrary], { numRuns: 2000 })(
      "deterministic result",
      (params) => {
        const result1 = isParams(params);
        const result2 = isParams(params);

        expect(result1).toBe(result2);
        expect(result1).toBe(true);

        return true;
      },
    );

    test.prop([fc.array(paramsSimpleArbitrary, { maxLength: 5 })], {
      numRuns: 2000,
    })("returns false for Params arrays", (paramsArray) => {
      // Arrays are not Params
      expect(isParams(paramsArray)).toBe(false);

      return true;
    });
  });

  describe("isParamsStrict", () => {
    test.prop([paramsSimpleArbitrary], { numRuns: 10_000 })(
      "always returns true for simple valid Params",
      (params) => {
        expect(isParamsStrict(params)).toBe(true);

        return true;
      },
    );

    test.prop([paramsWithArraysArbitrary], { numRuns: 10_000 })(
      "always returns true for Params with arrays",
      (params) => {
        expect(isParamsStrict(params)).toBe(true);

        return true;
      },
    );

    it("returns true for empty object", () => {
      expect(isParamsStrict({})).toBe(true);

      return true;
    });

    test.prop([invalidParamsArbitrary], { numRuns: 10_000 })(
      "returns false for invalid Params",
      (params) => {
        expect(isParamsStrict(params)).toBe(false);

        return true;
      },
    );

    test.prop([arbitraryInvalidTypes], { numRuns: 10_000 })(
      "returns false for primitives",
      (value) => {
        expect(isParamsStrict(value)).toBe(false);

        return true;
      },
    );

    test.prop([paramsSimpleArbitrary], { numRuns: 2000 })(
      "deterministic result",
      (params) => {
        const result1 = isParamsStrict(params);
        const result2 = isParamsStrict(params);

        expect(result1).toBe(result2);
        expect(result1).toBe(true);

        return true;
      },
    );
  });

  describe("Invariants isParams vs isParamsStrict", () => {
    test.prop([paramsSimpleArbitrary], { numRuns: 10_000 })(
      "isParamsStrict(x) implies isParams(x)",
      (params) => {
        if (isParamsStrict(params)) {
          expect(isParams(params)).toBe(true);
        }

        return true;
      },
    );

    test.prop([arbitraryInvalidTypes], { numRuns: 10_000 })(
      "!isParams(x) implies !isParamsStrict(x)",
      (value) => {
        if (!isParams(value)) {
          expect(isParamsStrict(value)).toBe(false);
        }

        return true;
      },
    );

    test.prop([paramsWithArraysArbitrary], { numRuns: 3000 })(
      "for valid Params both guards return the same result",
      (params) => {
        const resultParams = isParams(params);
        const resultParamsStrict = isParamsStrict(params);

        // For valid Params results should match
        expect(resultParams).toBe(resultParamsStrict);

        return true;
      },
    );
  });

  describe("Edge cases", () => {
    it("handles null and undefined", () => {
      expect(isParams(null)).toBe(false);
      expect(isParams(undefined)).toBe(false);
      expect(isParamsStrict(null)).toBe(false);
      expect(isParamsStrict(undefined)).toBe(false);

      return true;
    });

    test.prop(
      [
        fc.dictionary(fc.string(), fc.constant(null), {
          minKeys: 1,
          maxKeys: 3,
        }),
      ],
      { numRuns: 2000 },
    )("Params with null values", (params) => {
      // Null/undefined values are actually allowed in isValidParamValue!
      // See params.ts:14-16
      expect(isParams(params)).toBe(true);
      expect(isParamsStrict(params)).toBe(true);

      return true;
    });

    test.prop(
      [
        fc.dictionary(fc.string(), fc.constant(undefined), {
          minKeys: 1,
          maxKeys: 3,
        }),
      ],
      { numRuns: 2000 },
    )("Params with undefined values", (params) => {
      // Null/undefined values are actually allowed in isValidParamValue!
      // See params.ts:14-16
      expect(isParams(params)).toBe(true);
      expect(isParamsStrict(params)).toBe(true);

      return true;
    });

    it("Params with numbers (including edge cases)", () => {
      expect(isParams({ a: 0 })).toBe(true);
      expect(isParams({ a: -0 })).toBe(true);
      expect(isParams({ a: Number.MAX_SAFE_INTEGER })).toBe(true);
      expect(isParams({ a: Number.MIN_SAFE_INTEGER })).toBe(true);
      expect(isParams({ a: Number.NaN })).toBe(false);
      expect(isParams({ a: Infinity })).toBe(false);
      expect(isParams({ a: -Infinity })).toBe(false);

      return true;
    });

    test.prop(
      [fc.dictionary(fc.string(), fc.string(), { minKeys: 1, maxKeys: 100 })],
      { numRuns: 1000 },
    )("handles large number of keys", (params) => {
      expect(isParams(params)).toBe(true);
      expect(isParamsStrict(params)).toBe(true);

      return true;
    });

    it("handles special keys", () => {
      expect(isParams({ __proto__: "value" })).toBe(true);
      expect(isParams({ constructor: "value" })).toBe(true);
      expect(isParams({ toString: "value" })).toBe(true);

      return true;
    });
  });
});
