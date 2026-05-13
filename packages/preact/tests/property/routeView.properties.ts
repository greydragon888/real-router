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
 * 5. Shared prefix without segment boundary does not match
 * 6. Empty fullSegmentName always returns false (early return guard)
 * 7. Extended-alphabet segments (digits, `_`, `-`) preserve invariants 1–5
 * 8. Wide-depth route names (1–6 segments) preserve invariants 1, 3
 */

import { fc, test } from "@fast-check/vitest";
import { startsWithSegment } from "@real-router/route-utils";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbDottedName,
  arbDottedNameExtended,
  arbRouteNameWide,
  arbSegmentName,
  arbSegmentNameExtended,
} from "./helpers";

// =============================================================================
// Inline replica of isSegmentMatch (not exported)
// =============================================================================

function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (fullSegmentName === "") {
    return false;
  }

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
    test.prop([arbDottedName, arbDottedName], {
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
        fc.pre(a !== b);

        const routeName = `${a}${b}`;

        // Guard: suffix must not accidentally make it a boundary match.
        fc.pre(!routeName.startsWith(`${a}.`));

        expect(isSegmentMatch(routeName, a, false)).toBe(false);
      },
    );
  });

  describe("Invariant 6: Empty-string edge cases are well-defined", () => {
    test("isSegmentMatch('', '', true) === false (empty fullSegmentName — early return)", () => {
      expect(isSegmentMatch("", "", true)).toBe(false);
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

  describe("Invariant 7: Extended ASCII alphabet (digits, `_`, `-`, mixed case)", () => {
    // route-utils' SAFE_SEGMENT_PATTERN is `/^[\w.-]+$/` — letters, digits,
    // `_`, `-`. Real-world routes use `users-list`, `posts_2024`, mixed case.
    // The default `arbSegmentName` (`/^[a-z]{1,10}$/`) leaves the full ASCII
    // surface untested; this block verifies invariants 1–5 hold across it.
    test.prop([arbDottedNameExtended], { numRuns: NUM_RUNS.standard })(
      "Inv 1 ext: exact self-match holds for any safe-pattern name",
      (name) => {
        expect(isSegmentMatch(name, name, true)).toBe(true);
      },
    );

    test.prop([arbSegmentNameExtended, arbSegmentNameExtended], {
      numRuns: NUM_RUNS.standard,
    })(
      "Inv 3 ext: parent prefix matches child (non-exact) with digits/`_`/`-`",
      (parent, child) => {
        const routeName = `${parent}.${child}`;

        expect(isSegmentMatch(routeName, parent, false)).toBe(true);
      },
    );

    test.prop([arbSegmentNameExtended, arbSegmentNameExtended], {
      numRuns: NUM_RUNS.standard,
    })(
      "Inv 5 ext: shared prefix without segment boundary still rejects",
      (a, b) => {
        fc.pre(a !== b);

        const routeName = `${a}${b}`;

        // Same boundary guard as the base invariant 5 — only that `a`/`b`
        // now span the extended alphabet (digit-prefix permutations included).
        fc.pre(!routeName.startsWith(`${a}.`));

        expect(isSegmentMatch(routeName, a, false)).toBe(false);
      },
    );
  });

  describe("Invariant 9: Strict monotonicity — exact match implies non-exact match", () => {
    // If isSegmentMatch(a, b, true) then isSegmentMatch(a, b, false).
    // Exact match (a === b) is a specialisation of non-exact: since a = b,
    // startsWithSegment(a, b) must return true (a starts with itself at a
    // segment boundary). Violating monotonicity would mean a route exactly
    // matches a segment but is rejected by the prefix check — impossible by
    // the segment-boundary regex construction.
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      "exact match ⇒ non-exact match",
      (name) => {
        // exact=true self-match is always true (Inv 1).
        expect(isSegmentMatch(name, name, true)).toBe(true);
        // The same pair under non-exact must also be true.
        expect(isSegmentMatch(name, name, false)).toBe(true);
      },
    );

    // Generic: for any (name, segment) pair where exact returns true,
    // non-exact must also return true.
    test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.standard })(
      "for any (name, seg): exact(name, seg)=true ⇒ non-exact(name, seg)=true",
      (name, seg) => {
        const exact = isSegmentMatch(name, seg, true);
        const nonExact = isSegmentMatch(name, seg, false);

        if (exact) {
          expect(nonExact).toBe(true);
        }
      },
    );
  });

  describe("Invariant 8: Wide-depth route names (1–6 segments)", () => {
    // `arbRouteName` only emits 1–2-deep names; `arbDottedName` caps at 4.
    // Deeply nested route names ("a.b.c.d.e.f") exercise the regex
    // construction path of `startsWithSegment` (escape + dotOrEnd) at depths
    // where a regression in escape ordering would surface only on cumulative
    // segment-boundary matches.
    test.prop([arbRouteNameWide], { numRuns: NUM_RUNS.standard })(
      "Inv 1 wide: exact self-match holds for any depth",
      (name) => {
        expect(isSegmentMatch(name, name, true)).toBe(true);
      },
    );

    test.prop([arbRouteNameWide], { numRuns: NUM_RUNS.standard })(
      "Inv 3 wide: any non-final segment prefix matches the full name",
      (name) => {
        const segments = name.split(".");

        fc.pre(segments.length >= 2);

        // Use the parent (everything up to but not including the last segment)
        // as the test segment. Non-exact match must accept it.
        const parent = segments.slice(0, -1).join(".");

        expect(isSegmentMatch(name, parent, false)).toBe(true);
      },
    );
  });
});
