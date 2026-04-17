// packages/react/tests/property/linkUtils.properties.ts

/**
 * Property-based tests for shared dom-utils helpers.
 *
 * Confirmed bugs covered (regression-locked):
 * - `buildActiveClassName` must NOT produce double spaces when concatenating
 *   active class to a base className with surrounding/internal whitespace.
 * - Active class must be present in the result whenever isActive=true and
 *   activeClassName is non-empty.
 *
 * Confirmed bugs covered for `useStableValue.stableSerialize`:
 * - Key order in plain objects MUST NOT affect serialized output.
 * - Equal nested objects with reordered keys produce equal output.
 * - Throws (not silently equates) on BigInt.
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { buildActiveClassName, buildHref } from "../../src/dom-utils/index.js";
import { stableSerialize } from "../../src/hooks/useStableValue";

import type { Router } from "@real-router/core";

// =============================================================================
// buildActiveClassName invariants
// =============================================================================

const arbWhitespacePadding = fc.oneof(
  fc.constant(""),
  fc.constant(" "),
  fc.constant("  "),
  fc.constant("   "),
);

const arbToken = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

/** Base className built from N tokens with arbitrary whitespace padding. */
const arbBaseClassName: fc.Arbitrary<string> = fc
  .tuple(
    arbWhitespacePadding,
    fc.array(arbToken, { minLength: 0, maxLength: 4 }),
    arbWhitespacePadding,
  )
  .map(([head, tokens, tail]) => `${head}${tokens.join("  ")}${tail}`);

const arbActiveClassName = arbToken;

describe("buildActiveClassName — Property Tests", () => {
  describe("Invariant 1: result never contains double spaces (when isActive)", () => {
    // Bug-1 regression: active concat used to produce 'base  active'.
    // The invariant applies to the active-concat code path; when isActive=false
    // the function returns baseClassName as-is by design.
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "no '  ' substring when isActive=true",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );

        if (result === undefined) {
          return;
        }

        expect(result).not.toContain("  ");
      },
    );
  });

  describe("Invariant 2: active class present when isActive=true", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "result contains activeClassName as a token",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );
        const tokens = (result ?? "").split(/\s+/).filter(Boolean);

        expect(tokens).toContain(activeClassName);
      },
    );
  });

  describe("Invariant 3: active class present at most once", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })(
      "no duplicate activeClassName when already in base",
      (activeClassName, baseClassName) => {
        const result = buildActiveClassName(
          true,
          activeClassName,
          baseClassName,
        );
        const tokens = (result ?? "").split(/\s+/).filter(Boolean);
        const occurrences = tokens.filter((t) => t === activeClassName).length;

        // Invariant: regardless of whether activeClassName was already in base,
        // it must appear exactly once in the result.
        expect(occurrences).toBe(1);
      },
    );
  });

  describe("Invariant 4: result preserves base when isActive=false", () => {
    test.prop([arbActiveClassName, arbBaseClassName], {
      numRuns: NUM_RUNS.standard,
    })("isActive=false → returns baseClassName as-is", (a, base) => {
      expect(buildActiveClassName(false, a, base)).toBe(base);
    });
  });
});

// =============================================================================
// buildHref invariants
// =============================================================================

function makeFakeRouter(
  buildUrl: ((name: string, params: object) => string | undefined) | undefined,
  buildPath: (name: string, params: object) => string,
): Router {
  return { buildUrl, buildPath } as unknown as Router;
}

describe("buildHref — Property Tests", () => {
  describe("Invariant 5: falls back to buildPath when buildUrl returns undefined", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
    })("buildUrl=()=>undefined uses buildPath result", (path) => {
      const router = makeFakeRouter(
        () => undefined,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });

  describe("Invariant 6: prefers buildUrl when defined and returns string", () => {
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("returns buildUrl result, not buildPath", (url, path) => {
      const router = makeFakeRouter(
        () => url,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(url);
    });
  });

  describe("Invariant 7: returns undefined and logs error when both throw", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("throws → undefined", (name) => {
      const router = makeFakeRouter(
        () => {
          throw new Error("no");
        },
        () => {
          throw new Error("no");
        },
      );
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(buildHref(router, name, {})).toBeUndefined();
      expect(errSpy).toHaveBeenCalled();

      errSpy.mockRestore();
    });
  });
});

// =============================================================================
// stableSerialize — key-order insensitive
// =============================================================================

describe("stableSerialize — Property Tests", () => {
  describe("Invariant 8: key order does not affect output", () => {
    test.prop(
      [
        fc.array(
          fc.tuple(arbToken, fc.oneof(fc.integer(), fc.string(), fc.boolean())),
          { minLength: 1, maxLength: 5 },
        ),
      ],
      { numRuns: NUM_RUNS.thorough },
    )("permuted entries → same serialization", (entries) => {
      // Deduplicate by key: Object.fromEntries drops earlier duplicates, so
      // same-key-different-value pairs produce inequivalent objects in the
      // original and reversed arrays. Only unique-key entries match the invariant.
      const uniqueMap = new Map<string, unknown>();

      for (const [key, value] of entries) {
        uniqueMap.set(key, value);
      }

      const uniqueEntries = [...uniqueMap.entries()];

      fc.pre(uniqueEntries.length > 0);

      const original = Object.fromEntries(uniqueEntries);
      const reversed = Object.fromEntries(uniqueEntries.toReversed());

      expect(stableSerialize(original)).toBe(stableSerialize(reversed));
    });
  });

  describe("Invariant 9: nested objects also key-order normalized", () => {
    test.prop([arbToken, arbToken, fc.integer(), fc.integer()], {
      numRuns: NUM_RUNS.standard,
    })("nested permutation → same output", (a, b, va, vb) => {
      fc.pre(a !== b);

      const o1 = { outer: { [a]: va, [b]: vb } };
      const o2 = { outer: { [b]: vb, [a]: va } };

      expect(stableSerialize(o1)).toBe(stableSerialize(o2));
    });
  });

  describe("Invariant 10: BigInt throws (caller falls back to identity)", () => {
    test("BigInt input throws TypeError", () => {
      expect(() => stableSerialize({ id: 1n })).toThrow();
    });
  });

  describe("Invariant 11: arrays preserve order", () => {
    test.prop([fc.array(fc.integer(), { minLength: 1, maxLength: 5 })], {
      numRuns: NUM_RUNS.standard,
    })("array != reversed array (when contents differ)", (arr) => {
      fc.pre(arr.some((v, i) => v !== arr[arr.length - 1 - i]));

      expect(stableSerialize(arr)).not.toBe(stableSerialize(arr.toReversed()));
    });
  });
});
