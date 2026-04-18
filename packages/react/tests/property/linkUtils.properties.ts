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
 * Previously included tests for `stableSerialize` — moved to `@real-router/sources`
 * as `canonicalJson` (see `packages/sources/tests/unit/canonicalJson.test.ts`).
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS } from "./helpers";
import { buildActiveClassName, buildHref } from "../../src/dom-utils/index.js";

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

// Canonical serialization tests moved to @real-router/sources canonicalJson.
// See: packages/sources/tests/unit/canonicalJson.test.ts
