import { fc, test } from "@fast-check/vitest";
import { describe } from "vitest";

import {
  isString,
  isBoolean,
  isPromise,
  isObjKey,
  isPrimitiveValue,
} from "type-guards";

import { primitiveValueArbitrary, invalidPrimitiveArbitrary } from "../helpers";

describe("Primitive Type Guards Properties", () => {
  describe("isString", () => {
    test.prop([fc.string()], { numRuns: 10_000 })(
      "always returns true for strings",
      (value) => {
        expect(isString(value)).toBe(true);

        return true;
      },
    );

    test.prop([fc.oneof(fc.integer(), fc.boolean(), fc.constant(null))], {
      numRuns: 10_000,
    })("always returns false for non-strings", (value) => {
      expect(isString(value)).toBe(false);

      return true;
    });

    test.prop([fc.string(), fc.string()], { numRuns: 2000 })(
      "deterministic result for identical values",
      (value1, value2) => {
        const result1 = isString(value1);
        const result2 = isString(value2);

        if (value1 === value2) {
          expect(result1).toBe(result2);
        }

        return true;
      },
    );
  });

  describe("isBoolean", () => {
    test.prop([fc.boolean()], { numRuns: 10_000 })(
      "always returns true for boolean",
      (value) => {
        expect(isBoolean(value)).toBe(true);

        return true;
      },
    );

    test.prop(
      [fc.oneof(fc.string(), fc.integer(), fc.constant(null), fc.constant(1))],
      { numRuns: 10_000 },
    )("always returns false for non-boolean", (value) => {
      expect(isBoolean(value)).toBe(false);

      return true;
    });

    test("correctly distinguishes true and false", () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);

      return true;
    });
  });

  describe("isPromise", () => {
    test("always returns true for real Promise", () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(
        isPromise(
          Promise.reject(new Error("test error")).catch(() => undefined),
        ),
      ).toBe(true);
      expect(isPromise(new Promise(() => undefined))).toBe(true);

      return true;
    });

    test.prop([fc.func(fc.anything())], { numRuns: 1000 })(
      "returns true for thenable objects",
      (thenFunc) => {
        // eslint-disable-next-line unicorn/no-thenable
        const thenable = { then: thenFunc };

        expect(isPromise(thenable)).toBe(true);

        return true;
      },
    );

    test.prop([fc.oneof(fc.string(), fc.integer(), fc.constant(null))], {
      numRuns: 10_000,
    })("always returns false for non-promise", (value) => {
      expect(isPromise(value)).toBe(false);

      return true;
    });

    test.prop([fc.dictionary(fc.string(), fc.anything())], { numRuns: 2000 })(
      "returns false for objects without then",
      (obj) => {
        // Remove then if present
        delete obj.then;

        expect(isPromise(obj)).toBe(false);

        return true;
      },
    );
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

      return true;
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

      return true;
    });

    test.prop([fc.string(), fc.dictionary(fc.string(), fc.anything())], {
      numRuns: 2000,
    })("deterministic result", (key, obj) => {
      const result1 = isObjKey(key, obj);
      const result2 = isObjKey(key, obj);

      expect(result1).toBe(result2);

      return true;
    });

    test("correctly works with Symbol keys", () => {
      const sym = Symbol("test");
      const obj = { [sym]: 42 };

      expect(isObjKey(sym as unknown as string, obj)).toBe(true);

      return true;
    });
  });

  describe("isPrimitiveValue", () => {
    test.prop([primitiveValueArbitrary], { numRuns: 10_000 })(
      "always returns true for valid primitives",
      (value) => {
        expect(isPrimitiveValue(value)).toBe(true);

        return true;
      },
    );

    test.prop([invalidPrimitiveArbitrary], { numRuns: 1000 })(
      "always returns false for NaN, Infinity, -Infinity",
      (value) => {
        expect(isPrimitiveValue(value)).toBe(false);

        return true;
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

      return true;
    });

    test("correctly handles 0 and -0", () => {
      expect(isPrimitiveValue(0)).toBe(true);
      expect(isPrimitiveValue(-0)).toBe(true);

      return true;
    });

    test.prop([fc.integer()], { numRuns: 10_000 })(
      "always returns true for integers",
      (value) => {
        expect(isPrimitiveValue(value)).toBe(true);

        return true;
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

        return true;
      },
    );

    test("determinism for identical values", () => {
      expect(isPrimitiveValue("test")).toBe(true);
      expect(isPrimitiveValue("test")).toBe(true);
      expect(isPrimitiveValue(123)).toBe(true);
      expect(isPrimitiveValue(123)).toBe(true);

      return true;
    });
  });

  describe("Cross-function invariants", () => {
    test.prop([fc.string()], { numRuns: 2000 })(
      "isString(x) implies isPrimitiveValue(x)",
      (value) => {
        if (isString(value)) {
          expect(isPrimitiveValue(value)).toBe(true);
        }

        return true;
      },
    );

    test.prop([fc.boolean()], { numRuns: 2000 })(
      "isBoolean(x) implies isPrimitiveValue(x)",
      (value) => {
        if (isBoolean(value)) {
          expect(isPrimitiveValue(value)).toBe(true);
        }

        return true;
      },
    );

    test.prop([fc.integer()], { numRuns: 2000 })(
      "valid integer implies isPrimitiveValue",
      (value) => {
        // Integers are always valid primitives
        expect(isPrimitiveValue(value)).toBe(true);

        return true;
      },
    );

    test.prop([fc.anything()], { numRuns: 10_000 })(
      "each type must be uniquely classified",
      (value) => {
        // A primitive can only be one type (except Promise which can be objects)
        const primitiveTypes = [isString(value), isBoolean(value)].filter(
          Boolean,
        ).length;

        // Maximum 1 primitive type can be true
        expect(primitiveTypes).toBeLessThanOrEqual(1);

        return true;
      },
    );
  });
});
