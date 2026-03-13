import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { getTypeDescription } from "type-guards";

describe("Type Description Utilities - Property-Based Tests", () => {
  describe("getTypeDescription", () => {
    it('returns "null" for null', () => {
      expect(getTypeDescription(null)).toBe("null");
    });

    it('returns "undefined" for undefined', () => {
      expect(getTypeDescription(undefined)).toBe("undefined");
    });

    test.prop([fc.array(fc.anything(), { maxLength: 50 })], {
      numRuns: 5000,
    })("returns array[N] with correct length for arrays", (arr) => {
      expect(getTypeDescription(arr)).toBe(`array[${arr.length}]`);
    });

    test.prop(
      [
        fc.oneof(
          fc.constant(0).map(() => new Date()),
          fc.constant(0).map(() => new Map()),
          fc.constant(0).map(() => new Set()),
          fc.constant(0).map(() => /regex/),
        ),
      ],
      { numRuns: 5000 },
    )("returns constructor name for class instances", (instance) => {
      expect(getTypeDescription(instance)).toBe(instance.constructor.name);
    });

    test.prop([fc.object()], { numRuns: 5000 })(
      'returns "object" for plain objects',
      (obj) => {
        expect(getTypeDescription(obj)).toBe("object");
      },
    );

    test.prop([fc.oneof(fc.string(), fc.double(), fc.boolean())], {
      numRuns: 5000,
    })("returns typeof for primitive types", (value) => {
      expect(getTypeDescription(value)).toBe(typeof value);
    });

    test.prop([fc.func(fc.anything())], { numRuns: 2000 })(
      'returns "function" for functions',
      (fn) => {
        expect(getTypeDescription(fn)).toBe("function");
      },
    );

    it('returns "symbol" for symbols', () => {
      expect(getTypeDescription(Symbol("test"))).toBe("symbol");
      expect(getTypeDescription(Symbol.iterator)).toBe("symbol");
    });

    it('returns "object" for null-prototype objects', () => {
      const obj = Object.create(null) as Record<string, unknown>;

      obj.key = "value";

      expect(getTypeDescription(obj)).toBe("object");
    });
  });
});
