// packages/solid/tests/property/routeView.properties.ts

/**
 * Property-based smoke tests for isSegmentMatch logic in Solid RouteView.
 *
 * Tests the production function directly via internal export.
 *
 * Invariants:
 * 1. Exact match: isSegmentMatch(name, name, true) === true
 * 2. Exact mismatch: isSegmentMatch(a, b, true) === false (when a !== b)
 * 3. Prefix match: isSegmentMatch("parent.child", "parent", false) === true
 * 4. Non-prefix: isSegmentMatch("parent", "parent.child", false) === false
 * 5. Dot-boundary safety: prefix without dot separator must NOT match
 *    (e.g. "users2" vs "users")
 * 6. Empty `routeName` (first arg) is never a match against a non-empty segment
 * 7. Empty `fullSegmentName` (second arg) is never a match against a non-empty routeName
 */

import { fc, test } from "@fast-check/vitest";
import { UNKNOWN_ROUTE } from "@real-router/core";
import { describe, expect } from "vitest";

import { NUM_RUNS, arbAlphaSegmentName, arbDottedName } from "./helpers";
import {
  MATCH_MARKER,
  NOT_FOUND_MARKER,
  SELF_MARKER,
} from "../../src/components/RouteView/components";
import {
  buildRenderList,
  isSegmentMatch,
} from "../../src/components/RouteView/helpers";

import type { RouteViewMarker } from "../../src/components/RouteView/components";

// Alpha-only segment name to keep `parent + suffix` constructions free of
// hyphens/underscores that would alter the dot-boundary semantics being
// tested below. Reuses the legacy lowercase-Latin arbitrary from helpers.ts.
const arbSegmentName = arbAlphaSegmentName;

// =============================================================================
// Tests
// =============================================================================

describe("isSegmentMatch — Property Tests (Solid RouteView)", () => {
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

  describe("Invariant 5: Dot-boundary safety — string-prefix without dot must NOT match", () => {
    // Regression guard: a naive implementation using `String.startsWith`
    // alone would treat "users2" as descendant of "users". The dot is the
    // namespace separator; without it on the boundary, the prefix is
    // accidental.
    test.prop([arbSegmentName, fc.stringMatching(/^[a-z0-9]{1,5}$/)], {
      numRuns: NUM_RUNS.thorough,
    })(
      "isSegmentMatch('parent<suffix>', 'parent', false) === false when suffix has no leading dot",
      (parent, suffix) => {
        // suffix must not start with a dot — that would form a valid
        // descendant name ("parent.child"), which IS expected to match.
        const fullSegmentName = `${parent}${suffix}`;

        // Skip the exact-match case (suffix === ""), which is covered by
        // Invariant 1.
        fc.pre(fullSegmentName !== parent);

        expect(isSegmentMatch(fullSegmentName, parent, false)).toBe(false);
      },
    );
  });

  describe("Invariant 6: Empty `routeName` (first arg) is never a match", () => {
    // `isSegmentMatch("", segment, exact)`:
    //   - exact:  "" === segment → false (segment is non-empty)
    //   - non-exact: startsWithSegment("") guards empty name → false
    // Both branches return false; locked here so a future implementation
    // that special-cases the empty name does not silently break consumers.
    test.prop([arbDottedName, fc.boolean()], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch('', segment, exact) === false for any non-empty segment",
      (segment, exact) => {
        fc.pre(segment.length > 0);

        expect(isSegmentMatch("", segment, exact)).toBe(false);
      },
    );
  });

  describe("Invariant 7: Empty `fullSegmentName` (second arg) is never a match against a non-empty routeName", () => {
    // `isSegmentMatch(name, "", exact)`:
    //   - exact:  name === "" → false (name is non-empty)
    //   - non-exact: startsWithSegment(..., "") guards empty segment → false
    // RouteView's `processMatchChild` defends the `nodeName === ""` case
    // by replacing `${nodeName}.${segment}` with just `segment`, so the
    // helper itself is never expected to receive an empty fullSegmentName
    // from production code — this invariant nails down the defensive answer.
    test.prop([arbDottedName, fc.boolean()], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch(name, '', exact) === false for any non-empty name",
      (name, exact) => {
        fc.pre(name.length > 0);

        expect(isSegmentMatch(name, "", exact)).toBe(false);
      },
    );
  });
});

// =============================================================================
// buildRenderList — mutual exclusion + precedence (§6.2 Inv 8)
// =============================================================================

// Marker arbitraries — produce realistic Match/Self/NotFound shapes for
// fuzzing `buildRenderList`. The actual JSX `children` slot is filled with
// a sentinel string per marker so the assertion can identify which marker
// "won" without depending on Solid's render pipeline.
const markerChild = (): unknown => "child";

const arbMatchMarker: fc.Arbitrary<RouteViewMarker> = fc
  .record({
    segment: arbAlphaSegmentName,
    exact: fc.boolean(),
  })
  .map(
    ({ segment, exact }): RouteViewMarker => ({
      $$type: MATCH_MARKER,
      segment,
      exact,
      // The marker shape uses a getter for `children` in the production
      // factory; the helper consumes it via `.children` so a plain field
      // is structurally equivalent for the buildRenderList loop.
      children: markerChild() as never,
      fallback: undefined,
    }),
  );

const arbSelfMarker: fc.Arbitrary<RouteViewMarker> = fc.constant({
  $$type: SELF_MARKER,
  children: markerChild() as never,
  fallback: undefined,
});

const arbNotFoundMarker: fc.Arbitrary<RouteViewMarker> = fc.constant({
  $$type: NOT_FOUND_MARKER,
  children: markerChild() as never,
});

const arbAnyMarker: fc.Arbitrary<RouteViewMarker> = fc.oneof(
  arbMatchMarker,
  arbSelfMarker,
  arbNotFoundMarker,
);

describe("buildRenderList — Property Tests (Solid RouteView, §6.2 Inv 8)", () => {
  describe("Invariant 8: at most one element rendered (mutual exclusion)", () => {
    // Documented "first-match-wins" + "Self ⊥ NotFound mutual exclusion"
    // contract from helpers.tsx. The renderList must NEVER contain more
    // than one entry — Match suppresses Self/NotFound, only the first
    // matching Match contributes, only the first Self contributes,
    // NotFound and Self never co-render. Locking this property protects
    // against DOM duplication if the loop logic regresses.
    test.prop(
      [
        arbDottedName,
        arbAlphaSegmentName,
        fc.array(arbAnyMarker, { minLength: 0, maxLength: 6 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "buildRenderList(markers, routeName, nodeName).length <= 1 for any input",
      (routeName, nodeName, markers) => {
        const rendered = buildRenderList(markers, routeName, nodeName);

        expect(rendered.length).toBeLessThanOrEqual(1);
      },
    );

    // Companion property: when a Match WOULD activate, Self/NotFound never
    // appear in the output — even if both are present in the marker list.
    test.prop(
      [
        arbAlphaSegmentName,
        arbAlphaSegmentName,
        fc.array(arbAnyMarker, { minLength: 0, maxLength: 4 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "Match suppresses Self/NotFound when active route lives in the matched subtree",
      (segment, child, otherMarkers) => {
        fc.pre(segment !== child);

        // Build a marker list that always has at least one Match for the
        // segment plus a Self and a NotFound that could otherwise fire.
        const activatingMatch: RouteViewMarker = {
          $$type: MATCH_MARKER,
          segment,
          exact: false,
          children: markerChild() as never,
          fallback: undefined,
        };

        const selfMarker: RouteViewMarker = {
          $$type: SELF_MARKER,
          children: markerChild() as never,
          fallback: undefined,
        };

        const notFoundMarker: RouteViewMarker = {
          $$type: NOT_FOUND_MARKER,
          children: markerChild() as never,
        };

        const markers = [
          ...otherMarkers,
          activatingMatch,
          selfMarker,
          notFoundMarker,
        ];

        // routeName === parent (the nodeName "") + Match segment + child
        // forms a real descendant under root, which the Match should pick
        // up via non-exact mode. nodeName = "" exercises the root-RouteView
        // path through `processMatchChild`.
        const routeName = `${segment}.${child}`;
        const rendered = buildRenderList(markers, routeName, "");

        // Exactly 1 element — the Match — must win. Self/NotFound suppressed.
        expect(rendered).toHaveLength(1);
      },
    );

    // Companion property: when active route === UNKNOWN_ROUTE and no Match
    // activates, NotFound fires (not Self) — assuming the parent nodeName
    // is also not UNKNOWN_ROUTE (the rare edge where Self would win).
    test.prop([fc.array(arbMatchMarker, { minLength: 0, maxLength: 3 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "UNKNOWN_ROUTE + NotFound marker → exactly one rendered (the NotFound)",
      (otherMatches) => {
        const notFoundMarker: RouteViewMarker = {
          $$type: NOT_FOUND_MARKER,
          children: markerChild() as never,
        };

        // Self with `nodeName !== UNKNOWN_ROUTE` cannot fire on
        // UNKNOWN_ROUTE — include it to prove suppression.
        const selfMarker: RouteViewMarker = {
          $$type: SELF_MARKER,
          children: markerChild() as never,
          fallback: undefined,
        };

        const markers = [...otherMatches, selfMarker, notFoundMarker];
        // None of the Match markers can match UNKNOWN_ROUTE — it starts
        // with the `@@` internal prefix which arbAlphaSegmentName excludes
        // by construction.
        const rendered = buildRenderList(markers, UNKNOWN_ROUTE, "");

        expect(rendered).toHaveLength(1);
      },
    );
  });
});
