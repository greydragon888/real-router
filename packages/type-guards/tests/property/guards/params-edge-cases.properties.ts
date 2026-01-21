import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { isParams } from "type-guards";

import { paramsSimpleArbitrary } from "../helpers";

/**
 * Edge case tests for uncovered branches in params.ts
 * Goal: increase coverage from 80.64% to 95%+
 */
describe("Params Edge Cases (Uncovered Branches)", () => {
  describe("undefined/null in values (lines 15-16)", () => {
    test.prop(
      [
        fc.dictionary(fc.string({ minLength: 1 }), fc.constant(undefined), {
          minKeys: 1,
          maxKeys: 3,
        }),
      ],
      { numRuns: 5000 },
    )("isParams accepts undefined values via isValidParamValue", (params) => {
      // Line 15-16: if (value === undefined || value === null) return true
      expect(isParams(params)).toBe(true);

      return true;
    });

    test.prop(
      [
        fc.dictionary(fc.string({ minLength: 1 }), fc.constant(null), {
          minKeys: 1,
          maxKeys: 3,
        }),
      ],
      { numRuns: 5000 },
    )("isParams accepts null values via isValidParamValue", (params) => {
      // Line 15-16: if (value === undefined || value === null) return true
      expect(isParams(params)).toBe(true);

      return true;
    });
  });

  describe("Boolean in arrays (line 38)", () => {
    test.prop([fc.array(fc.boolean(), { minLength: 1, maxLength: 10 })], {
      numRuns: 10_000,
    })("isParams accepts arrays of boolean values", (boolArray) => {
      // Line 38: typeof item === "boolean"
      const params = { flags: boolArray };

      expect(isParams(params)).toBe(true);

      return true;
    });

    test.prop(
      [
        fc.array(fc.oneof(fc.string(), fc.integer(), fc.boolean()), {
          minLength: 1,
          maxLength: 10,
        }),
      ],
      { numRuns: 10_000 },
    )("isParams accepts mixed arrays with boolean", (mixedArray) => {
      // Line 38: typeof item === "boolean" in context of other types
      const params = { mixed: mixedArray };

      expect(isParams(params)).toBe(true);

      return true;
    });

    it("isParams accepts arrays containing only boolean", () => {
      expect(isParams({ a: [true, false, true] })).toBe(true);
      expect(isParams({ b: [false] })).toBe(true);
      expect(isParams({ c: [true, true, true, false, false] })).toBe(true);

      return true;
    });
  });

  describe("Objects inside arrays (lines 49-52)", () => {
    test.prop(
      [fc.array(paramsSimpleArbitrary, { minLength: 1, maxLength: 5 })],
      { numRuns: 10_000 },
    )("isParams accepts arrays of nested params objects", (arrayOfObjects) => {
      // Line 49: if (item && typeof item === "object" && !Array.isArray(item))
      // Line 49: return isParams(item)
      const params = { items: arrayOfObjects };

      expect(isParams(params)).toBe(true);

      return true;
    });

    test.prop(
      [
        fc.array(fc.oneof(fc.string(), fc.integer(), paramsSimpleArbitrary), {
          minLength: 1,
          maxLength: 5,
        }),
      ],
      { numRuns: 10_000 },
    )("isParams accepts mixed arrays with objects", (mixedArray) => {
      // Line 49: objects together with primitives in array
      const params = { mixed: mixedArray };

      expect(isParams(params)).toBe(true);

      return true;
    });

    it("isParams accepts arrays with nested objects", () => {
      expect(isParams({ users: [{ id: 1 }, { id: 2 }] })).toBe(true);
      expect(isParams({ data: [{ name: "foo" }, { name: "bar" }] })).toBe(true);
      expect(
        isParams({
          items: [
            { id: "a", count: 1 },
            { id: "b", count: 2 },
          ],
        }),
      ).toBe(true);

      return true;
    });

    test.prop([fc.array(fc.constant(null), { minLength: 1, maxLength: 3 })], {
      numRuns: 5000,
    })("isParams accepts arrays with null elements", (nullArray) => {
      // null is allowed in arrays - line 18-21: if (value === null || value === undefined) return true
      // This supports sparse data: { scores: [100, null, 85] }
      const params = { nulls: nullArray };

      expect(isParams(params)).toBe(true);

      return true;
    });
  });

  describe("Nested objects as values (lines 58-74)", () => {
    test.prop([paramsSimpleArbitrary], { numRuns: 10_000 })(
      "isParams accepts objects with nested params",
      (nestedParams) => {
        // Line 73: return isParams(value) - recursive validation
        const params = { nested: nestedParams };

        expect(isParams(params)).toBe(true);

        return true;
      },
    );

    test.prop(
      [
        fc.record({
          id: fc.string(),
          meta: paramsSimpleArbitrary,
        }),
      ],
      { numRuns: 10_000 },
    )("isParams accepts deeply nested structures", (complexObject) => {
      // Line 73: recursive validation of nested objects
      expect(isParams(complexObject)).toBe(true);

      return true;
    });

    test.prop(
      [
        fc.dictionary(
          fc.string({ minLength: 1 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
          { minKeys: 1, maxKeys: 5 },
        ),
      ],
      { numRuns: 10_000 },
    )(
      "isParams accepts simple records of primitives (line 68-69)",
      (simpleRecord) => {
        // Line 61-66: isSimpleRecord check
        // Line 68-69: if (isSimpleRecord) return true
        const params = { record: simpleRecord };

        expect(isParams(params)).toBe(true);

        return true;
      },
    );

    it("isParams accepts multi-level nesting", () => {
      expect(
        isParams({
          level1: {
            level2: {
              level3: {
                value: "deep",
              },
            },
          },
        }),
      ).toBe(true);

      expect(
        isParams({
          user: {
            profile: {
              settings: {
                theme: "dark",
                lang: "en",
              },
            },
          },
        }),
      ).toBe(true);

      return true;
    });

    test.prop(
      [
        fc.record({
          primitives: fc.dictionary(
            fc.string(),
            fc.oneof(fc.string(), fc.integer()),
          ),
          nested: paramsSimpleArbitrary,
        }),
      ],
      { numRuns: 5000 },
    )(
      "isParams handles combination of simple records and nested objects",
      (mixedParams) => {
        // Validates both paths: lines 68-69 and line 73
        expect(isParams(mixedParams)).toBe(true);

        return true;
      },
    );
  });

  describe("Complex coverage scenarios", () => {
    test.prop(
      [
        fc.record({
          nullValue: fc.constant(null),
          undefinedValue: fc.constant(undefined),
          boolArray: fc.array(fc.boolean(), { maxLength: 3 }),
          objectArray: fc.array(paramsSimpleArbitrary, { maxLength: 2 }),
          nestedObject: paramsSimpleArbitrary,
          simpleRecord: fc.dictionary(fc.string(), fc.string(), { maxKeys: 3 }),
        }),
      ],
      { numRuns: 10_000 },
    )("isParams handles all branch types simultaneously", (complexParams) => {
      // This test covers all uncovered branches:
      // - null/undefined (15-16)
      // - boolean in arrays (38)
      // - objects in arrays (49-52)
      // - nested objects (58-74)
      expect(isParams(complexParams)).toBe(true);

      return true;
    });

    it("isParams: real-world examples with uncovered branches", () => {
      // Query params with flags
      expect(
        isParams({
          filters: {
            active: true,
            archived: false,
            pending: true,
          },
        }),
      ).toBe(true);

      // Array of filter objects
      expect(
        isParams({
          searches: [
            { query: "foo", exact: true },
            { query: "bar", exact: false },
          ],
        }),
      ).toBe(true);

      // Null/undefined values for optional fields
      expect(
        isParams({
          userId: "123",
          teamId: null,
          orgId: undefined,
        }),
      ).toBe(true);

      // Arrays of flags
      expect(
        isParams({
          permissions: [true, false, true, true],
          features: [false, false, true],
        }),
      ).toBe(true);

      return true;
    });
  });

  describe("Negative cases for uncovered branches", () => {
    test.prop(
      [
        fc.array(
          fc.oneof(fc.constant(Symbol("test")), fc.func(fc.anything())),
          { minLength: 1, maxLength: 3 },
        ),
      ],
      { numRuns: 5000 },
    )("isParams rejects arrays with invalid types", (invalidArray) => {
      // Line 52: return false for invalid array elements
      const params = { invalid: invalidArray };

      expect(isParams(params)).toBe(false);

      return true;
    });

    test.prop(
      [
        fc.record({
          nested: fc.oneof(fc.func(fc.anything()), fc.constant(Symbol("test"))),
        }),
      ],
      { numRuns: 5000 },
    )(
      "isParams rejects objects with invalid nested values",
      (invalidNested) => {
        // Line 73: isParams(value) should return false
        expect(isParams(invalidNested)).toBe(false);

        return true;
      },
    );
  });
});
