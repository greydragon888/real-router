import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isString, isBoolean, isObjKey } from "../../../src/type-guards";

describe("Primitive Type Guards Properties", () => {
  describe("isString", () => {
    test.prop([fc.string()], { numRuns: 10_000 })(
      "always returns true for strings",
      (value) => {
        expect(isString(value)).toBe(true);
      },
    );

    test.prop([fc.oneof(fc.integer(), fc.boolean(), fc.constant(null))], {
      numRuns: 10_000,
    })("always returns false for non-strings", (value) => {
      expect(isString(value)).toBe(false);
    });

    test.prop([fc.string(), fc.string()], { numRuns: 2000 })(
      "deterministic result for identical values",
      (value1, value2) => {
        const result1 = isString(value1);
        const result2 = isString(value2);

        if (value1 === value2) {
          expect(result1).toBe(result2);
        }
      },
    );
  });

  describe("isBoolean", () => {
    test.prop([fc.boolean()], { numRuns: 10_000 })(
      "always returns true for boolean",
      (value) => {
        expect(isBoolean(value)).toBe(true);
      },
    );

    test.prop(
      [fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(1))],
      { numRuns: 10_000 },
    )("always returns false for non-boolean", (value) => {
      expect(isBoolean(value)).toBe(false);
    });

    it("correctly distinguishes true and false", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });
  });

  describe("isObjKey", () => {
    test.prop(
      [
        fc.dictionary(fc.string({ minLength: 1 }), fc.anything(), {
          minKeys: 1,
          maxKeys: 10,
        }),
      ],
      { numRuns: 10_000 },
    )("always returns true for existing keys", (obj) => {
      const keys = Object.keys(obj);

      for (const key of keys) {
        expect(isObjKey(key, obj)).toBe(true);
      }
    });

    test.prop(
      [
        fc.dictionary(fc.string({ minLength: 1 }), fc.anything(), {
          maxKeys: 5,
        }),
        fc.string({ minLength: 1, maxLength: 20 }),
      ],
      { numRuns: 10_000 },
    )("returns false for non-existing keys", (obj, nonExistingKey) => {
      // Ensure the key doesn't exist (neither own nor inherited)
      if (Object.hasOwn(obj, nonExistingKey)) {
        delete obj[nonExistingKey];
      }

      // isObjKey uses 'in' operator, which checks inherited properties too
      // So if the key is inherited (e.g., "valueOf", "toString"), it returns true
      const expectedResult = nonExistingKey in obj;

      expect(isObjKey(nonExistingKey, obj)).toBe(expectedResult);
    });

    test.prop([fc.string(), fc.dictionary(fc.string(), fc.anything())], {
      numRuns: 2000,
    })("deterministic result", (key, obj) => {
      const result1 = isObjKey(key, obj);
      const result2 = isObjKey(key, obj);

      expect(result1).toBe(result2);
    });

    it("correctly works with Symbol keys", () => {
      const sym = Symbol("test");
      const obj = { [sym]: 42 };

      expect(isObjKey(sym as unknown as string, obj)).toBe(true);
    });
  });

  describe("Cross-function invariants", () => {
    test.prop([fc.anything()], { numRuns: 10_000 })(
      "each type must be uniquely classified",
      (value) => {
        // A primitive can only be one type (except Promise which can be objects)
        const primitiveTypes = [isString(value), isBoolean(value)].filter(
          Boolean,
        ).length;

        // Maximum 1 primitive type can be true
        expect(primitiveTypes).toBeLessThanOrEqual(1);
      },
    );
  });
});
