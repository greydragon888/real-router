// packages/preact/tests/property/routeView.properties.ts

/**
 * Property-based smoke tests for isSegmentMatch logic in Preact RouteView.
 *
 * isSegmentMatch is NOT exported — we replicate the logic here.
 * It delegates to startsWithSegment from @real-router/route-utils for non-exact.
 *
 * Invariants:
 * 1. Exact match: isSegmentMatch(name, name, true) === true
 * 2. Exact mismatch: isSegmentMatch(name, other, true) === false (when name !== other)
 * 3. Prefix match: isSegmentMatch("parent.child", "parent", false) === true
 * 4. Non-prefix: isSegmentMatch("parent", "parent.child", false) === false
 */

import { fc, test } from "@fast-check/vitest";
import { startsWithSegment } from "@real-router/route-utils";
import { describe, expect } from "vitest";

import { NUM_RUNS, arbSegmentName, arbDottedName } from "./helpers";

// =============================================================================
// Inline replica of isSegmentMatch (not exported)
// =============================================================================

function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
}

// =============================================================================
// Tests
// =============================================================================

describe("isSegmentMatch — Property Tests (Preact RouteView)", () => {
  describe("Invariant 1: Exact self-match", () => {
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch(name, name, true) === true",
      (name) => {
        expect(isSegmentMatch(name, name, true)).toBe(true);
      },
    );
  });

  describe("Invariant 2: Exact mismatch", () => {
    test.prop([arbDottedName, arbDottedName.filter((n) => n.length > 0)], {
      numRuns: NUM_RUNS.standard,
    })("isSegmentMatch(a, b, true) === false when a !== b", (a, b) => {
      fc.pre(a !== b);

      expect(isSegmentMatch(a, b, true)).toBe(false);
    });
  });

  describe("Invariant 3: Parent prefix matches child (non-exact)", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch('parent.child', 'parent', false) === true",
      (parent, child) => {
        const routeName = `${parent}.${child}`;

        expect(isSegmentMatch(routeName, parent, false)).toBe(true);
      },
    );
  });

  describe("Invariant 4: Child does not match parent (non-exact)", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch('parent', 'parent.child', false) === false",
      (parent, child) => {
        const fullSegmentName = `${parent}.${child}`;

        expect(isSegmentMatch(parent, fullSegmentName, false)).toBe(false);
      },
    );
  });

  describe("Invariant 5: Shared prefix without segment boundary does not match", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch('usersAdmin', 'users', false) === false",
      (a, b) => {
        fc.pre(a !== b && !a.includes(".") && !b.includes("."));

        const routeName = `${a}${b}`;

        // Guard: suffix must not accidentally make it a boundary match.
        fc.pre(!routeName.startsWith(`${a}.`));

        expect(isSegmentMatch(routeName, a, false)).toBe(false);
      },
    );
  });

  describe("Invariant 6: Empty-string edge cases are well-defined", () => {
    test("isSegmentMatch('', '', true) === true (exact self-match of empty)", () => {
      expect(isSegmentMatch("", "", true)).toBe(true);
    });

    test("isSegmentMatch('users', '', true) === false (empty segment, non-empty name)", () => {
      expect(isSegmentMatch("users", "", true)).toBe(false);
    });

    test("isSegmentMatch('', 'users', true) === false (non-empty segment, empty name)", () => {
      expect(isSegmentMatch("", "users", true)).toBe(false);
    });

    test("isSegmentMatch('', 'users', false) === false (non-empty segment, empty name)", () => {
      expect(isSegmentMatch("", "users", false)).toBe(false);
    });
  });
});
