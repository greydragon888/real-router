import fc from "fast-check";
import { describe, it, expect } from "vitest";

import { getInvalidKeys, omitKeys } from "../../src/helpers";

import type { StandardSchemaV1Issue } from "../../src/types";
import type { Params } from "@real-router/core";

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

const arbParams = fc.dictionary(arbKey, arbPrimitive, {
  minKeys: 0,
  maxKeys: 5,
}) as fc.Arbitrary<Params>;

const arbPropertyKey: fc.Arbitrary<PropertyKey> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 10 }),
  fc.integer({ min: 0, max: 100 }),
);

const arbObjectSegment: fc.Arbitrary<{ readonly key: PropertyKey }> =
  arbPropertyKey.map((key) => ({ key }));

const arbPathSegment: fc.Arbitrary<
  PropertyKey | { readonly key: PropertyKey }
> = fc.oneof(arbPropertyKey, arbObjectSegment);

const arbNonEmptyPath = fc.array(arbPathSegment, {
  minLength: 1,
  maxLength: 5,
});

const arbIssueWithPath: fc.Arbitrary<StandardSchemaV1Issue> = fc
  .tuple(fc.string({ maxLength: 30 }), arbNonEmptyPath)
  .map(([message, path]) => ({ message, path }));

const arbIssueWithoutPath: fc.Arbitrary<StandardSchemaV1Issue> = fc
  .string({ maxLength: 30 })
  .map((message) => ({ message }));

const arbIssueWithEmptyPath: fc.Arbitrary<StandardSchemaV1Issue> = fc
  .string({ maxLength: 30 })
  .map((message) => ({
    message,
    path: [] as readonly (PropertyKey | { readonly key: PropertyKey })[],
  }));

const arbIssue: fc.Arbitrary<StandardSchemaV1Issue> = fc.oneof(
  arbIssueWithPath,
  arbIssueWithoutPath,
  arbIssueWithEmptyPath,
);

const arbIssues = fc.array(arbIssue, { minLength: 0, maxLength: 10 });

const arbKeySet = fc
  .array(arbKey, { minLength: 0, maxLength: 5 })
  .map((keys) => new Set(keys));

// =============================================================================
// getInvalidKeys
// =============================================================================

describe("getInvalidKeys", () => {
  it("Exact equality with expected keys", () => {
    fc.assert(
      fc.property(arbIssues, (issues) => {
        const result = getInvalidKeys(issues);

        const expectedKeys = new Set<string>();

        for (const issue of issues) {
          if (issue.path && issue.path.length > 0) {
            const segment = issue.path[0];
            const key =
              typeof segment === "object" && "key" in segment
                ? segment.key
                : segment;

            expectedKeys.add(String(key));
          }
        }

        expect(result).toStrictEqual(expectedKeys);
      }),
    );
  });

  it("Path-less issues ignored", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(arbIssueWithoutPath, arbIssueWithEmptyPath), {
          minLength: 1,
          maxLength: 10,
        }),
        (issues) => {
          const result = getInvalidKeys(issues);

          expect(result.size).toBe(0);
        },
      ),
    );
  });

  it("Object segment extraction", () => {
    fc.assert(
      fc.property(arbIssueWithPath, (issue) => {
        const result = getInvalidKeys([issue]);
        const segment = issue.path![0];
        const expected =
          typeof segment === "object" && "key" in segment
            ? String(segment.key)
            : String(segment);

        expect(result.has(expected)).toBe(true);
      }),
    );
  });

  it("Idempotency", () => {
    fc.assert(
      fc.property(arbIssues, (issues) => {
        const first = getInvalidKeys(issues);
        const second = getInvalidKeys(issues);

        expect(first).toStrictEqual(second);
      }),
    );
  });
});

// =============================================================================
// omitKeys
// =============================================================================

describe("omitKeys", () => {
  it("Exclusion guarantee", () => {
    fc.assert(
      fc.property(arbParams, arbKeySet, (params, keys) => {
        const result = omitKeys(params, keys);

        for (const key of keys) {
          expect(result).not.toHaveProperty(key);
        }
      }),
    );
  });

  it("Retention guarantee", () => {
    fc.assert(
      fc.property(arbParams, arbKeySet, (params, keys) => {
        const result = omitKeys(params, keys);

        for (const key of Object.keys(params)) {
          if (!keys.has(key)) {
            expect(result[key]).toBe(params[key]);
          }
        }
      }),
    );
  });

  it("No mutation", () => {
    fc.assert(
      fc.property(arbParams, arbKeySet, (params, keys) => {
        const before = Object.entries(params);

        omitKeys(params, keys);

        expect(Object.entries(params)).toStrictEqual(before);
      }),
    );
  });

  it("Empty exclusion is identity", () => {
    fc.assert(
      fc.property(arbParams, (params) => {
        const result = omitKeys(params, new Set());
        const ownKeys = Object.keys(params);

        const cmp = (a: string, b: string): number => a.localeCompare(b);

        expect(Object.keys(result).toSorted(cmp)).toStrictEqual(
          ownKeys.toSorted(cmp),
        );

        for (const key of ownKeys) {
          expect(result[key]).toBe(params[key]);
        }
      }),
    );
  });
});
