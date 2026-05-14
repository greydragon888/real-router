// packages/vue/tests/property/routeView.properties.ts

/**
 * Property-based smoke tests for isSegmentMatch logic in Vue RouteView.
 *
 * isSegmentMatch is imported directly from helpers.ts (exported for testing).
 * It delegates to startsWithSegment from @real-router/route-utils for non-exact.
 *
 * Unlike Preact's adapter, Vue's `isSegmentMatch` does NOT short-circuit on
 * empty `fullSegmentName` — it only branches on `exact`. The non-exact path
 * passes through to `startsWithSegment`, which itself returns `false` for any
 * empty input (route name or segment). Exact comparison is bare `===`, so the
 * `("", "", true)` corner-case returns `true` (both equal) — captured below.
 *
 * Closes §2.2 review items:
 * - Inv 5 Shared-prefix-without-boundary
 * - Inv 6 Empty-string edge cases (Vue semantics, not Preact's)
 * - Inv 7 Extended ASCII alphabet (digits, `_`, `-`, mixed case)
 * - Inv 8 Wide-depth route names (1–6 segments)
 * - Inv 9 Strict monotonicity (exact ⇒ non-exact)
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbDottedName,
  arbDottedNameExtended,
  arbRouteNameWide,
  arbSegmentName,
  arbSegmentNameExtended,
} from "./helpers";
import { isSegmentMatch } from "../../src/components/RouteView/helpers";

// =============================================================================
// Tests
// =============================================================================

describe("isSegmentMatch — Property Tests (Vue RouteView)", () => {
  describe("Invariant 1: Exact self-match", () => {
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch(name, name, true) === true",
      (name) => {
        expect(isSegmentMatch(name, name, true)).toBe(true);
      },
    );
  });

  describe("Invariant 2: Exact mismatch", () => {
    // arbDottedName is built from arbSegmentName (`/^[a-z]{1,10}$/`) joined
    // with ".", with `minLength: 1` on the segment array — every draw has
    // length ≥ 1. The previous `.filter((n) => n.length > 0)` was tautological;
    // dropped in favour of relying on the generator contract directly.
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

  describe("Invariant 6: Empty-string edge cases (Vue semantics)", () => {
    // Vue's `isSegmentMatch` does NOT have Preact's early-return-on-empty
    // guard — the exact branch is bare `===`, so the `("", "", true)` pair
    // matches reflexively. The non-exact branch defers to `startsWithSegment`,
    // which returns `false` for ANY empty input (route name OR segment).
    test("isSegmentMatch('', '', true) === true (exact branch — bare ===)", () => {
      // Bare string equality returns true; this differs from Preact's adapter,
      // which has an early-return that would yield false. Vue ships this
      // behaviour because the surrounding pipeline (`evaluateMatch`) is the
      // safeguard — `segment=""` is documented in CLAUDE.md as "never matches"
      // because non-exact mode is the default and `startsWithSegment` returns
      // false for empty segments.
      expect(isSegmentMatch("", "", true)).toBe(true);
    });

    test("isSegmentMatch('users', '', true) === false (non-empty name vs empty)", () => {
      expect(isSegmentMatch("users", "", true)).toBe(false);
    });

    test("isSegmentMatch('', 'users', true) === false (empty name vs non-empty)", () => {
      expect(isSegmentMatch("", "users", true)).toBe(false);
    });

    test("isSegmentMatch('', '', false) === false (startsWithSegment rejects empty)", () => {
      // `startsWithSegment` returns false for any empty input — both empty
      // route name and empty segment short-circuit there. This is the path
      // the documented `segment=""` gotcha (CLAUDE.md L301-314) relies on.
      expect(isSegmentMatch("", "", false)).toBe(false);
    });

    test("isSegmentMatch('users', '', false) === false (empty segment rejected)", () => {
      expect(isSegmentMatch("users", "", false)).toBe(false);
    });

    test("isSegmentMatch('', 'users', false) === false (empty route name rejected)", () => {
      expect(isSegmentMatch("", "users", false)).toBe(false);
    });
  });

  describe("Invariant 7: Extended ASCII alphabet (digits, `_`, `-`, mixed case)", () => {
    // route-utils' SAFE_SEGMENT_PATTERN is `/^[\w.-]+$/` — letters, digits,
    // `_`, `-`. Real-world routes use `users-list`, `posts_2024`, mixed case.
    // The default `arbSegmentName` (`/^[a-z]{1,10}$/`) leaves the full ASCII
    // surface untested; this block verifies invariants 1, 3, 5 hold across it.
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

  describe("Invariant 9: Strict monotonicity — exact match implies non-exact match", () => {
    // If isSegmentMatch(a, b, true) then isSegmentMatch(a, b, false).
    // Exact match (a === b) is a specialisation of non-exact: since a = b,
    // startsWithSegment(a, b) must return true (a starts with itself at a
    // segment boundary). Violating monotonicity would mean a route exactly
    // matches a segment but is rejected by the prefix check — impossible by
    // the segment-boundary regex construction (Vue's `dotOrEnd`).
    //
    // Vue caveat: the ("", "", true) pair is the one exception — exact `===`
    // returns true but `startsWithSegment("", "")` returns false. The arbitrary
    // `arbDottedName` filters minLength=1 so this case is never drawn; the
    // generic property below uses `arbDottedName` for both sides for the
    // same reason.
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      "exact match ⇒ non-exact match (non-empty name)",
      (name) => {
        // exact=true self-match is always true (Inv 1).
        expect(isSegmentMatch(name, name, true)).toBe(true);
        // The same pair under non-exact must also be true.
        expect(isSegmentMatch(name, name, false)).toBe(true);
      },
    );

    // Generic: for any (name, segment) pair where exact returns true,
    // non-exact must also return true — except for the ("", "") corner case
    // (excluded by the minLength: 1 floor in `arbDottedName`).
    test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.standard })(
      "for any non-empty (name, seg): exact(name, seg)=true ⇒ non-exact(name, seg)=true",
      (name, seg) => {
        const exact = isSegmentMatch(name, seg, true);
        const nonExact = isSegmentMatch(name, seg, false);

        if (exact) {
          expect(nonExact).toBe(true);
        }
      },
    );
  });
});
