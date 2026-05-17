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
  collectElements,
  isSegmentMatch,
} from "../../src/components/RouteView/helpers";
import { isRouteActive } from "../../src/RouterProvider";

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

  describe("Invariant 8: Monotonicity exact→non-exact (§6.4 №4)", () => {
    // Mathematical claim: if `exact=true` matches, then `exact=false` also
    // matches — relaxing the predicate cannot reject what strict accepts.
    // Regression guard against a refactor that inverts the `exact` branch
    // or short-circuits the non-exact path.
    test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch(a, b, true) === true ⇒ isSegmentMatch(a, b, false) === true",
      (a, b) => {
        if (isSegmentMatch(a, b, true)) {
          expect(isSegmentMatch(a, b, false)).toBe(true);
        }
      },
    );
  });

  describe("Invariant 9: Cross-function consistency with isRouteActive (§6.4 №5, §6.5 №1)", () => {
    // Two production functions decide "is this segment/link active in the
    // current route" in different code paths:
    //   - `isRouteActive(linkRouteName, currentRouteName)` in RouterProvider
    //     drives the Link fast-path createSelector.
    //   - `isSegmentMatch(routeName, fullSegmentName, false)` in RouteView
    //     decides whether a `<Match segment>` child should render.
    // If they diverge, a Link can show "active" while the corresponding
    // RouteView block fails to render (or vice-versa). One of the worst-
    // diagnosable classes of bug in the adapter — this property locks the
    // equivalence and removes the entire class.
    test.prop([arbDottedName, arbDottedName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch(routeName, segment, false) ⇔ isRouteActive(segment, routeName)",
      (routeName, segment) => {
        expect(isSegmentMatch(routeName, segment, false)).toBe(
          isRouteActive(segment, routeName),
        );
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

  describe("Invariant 9: first-Match-wins among multiple activating Match (§6.4 №7, §6.5 №3)", () => {
    // Documented in helpers.tsx (122-146) but only verified indirectly via
    // "at most one" (Invariant 8). If a refactor switches to last-wins (e.g.
    // a reduce over the marker list), consumers relying on JSX declaration
    // order silently see a different child. Use identifiable `children`
    // payloads ("FIRST" / "SECOND") to prove which Match actually wins.
    test.prop(
      [
        arbAlphaSegmentName,
        arbAlphaSegmentName,
        fc.array(arbMatchMarker, { minLength: 0, maxLength: 4 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "two Match markers with the same segment — only the first contributes",
      (segment, child, otherMatches) => {
        // `otherMatches` must NOT contain the same segment (would shadow
        // FIRST). The shape of arbMatchMarker uses arbAlphaSegmentName for
        // segment which has no other constraints — filter manually.
        fc.pre(segment !== child);
        fc.pre(
          otherMatches.every((m) => "segment" in m && m.segment !== segment),
        );

        const first: RouteViewMarker = {
          $$type: MATCH_MARKER,
          segment,
          exact: false,
          children: "FIRST" as never,
          fallback: undefined,
        };
        const second: RouteViewMarker = {
          $$type: MATCH_MARKER,
          segment,
          exact: false,
          children: "SECOND" as never,
          fallback: undefined,
        };

        const rendered = buildRenderList(
          [first, ...otherMatches, second],
          `${segment}.${child}`,
          "",
        );

        expect(rendered).toHaveLength(1);
        expect(rendered[0]).toBe("FIRST");
      },
    );
  });

  describe("Invariant 10: first-Self-wins (§6.4 №7)", () => {
    // Documented through `selfMarker ??= child` in helpers.tsx — later
    // Self markers are silently ignored. Property locks the behavior
    // (and protects against a refactor that switches to last-wins).
    test("two Self markers in same RouteView — only the first contributes", () => {
      // Active route name equals nodeName ("users") so Self fires.
      const first: RouteViewMarker = {
        $$type: SELF_MARKER,
        children: "FIRST" as never,
        fallback: undefined,
      };
      const second: RouteViewMarker = {
        $$type: SELF_MARKER,
        children: "SECOND" as never,
        fallback: undefined,
      };

      const rendered = buildRenderList([first, second], "users", "users");

      expect(rendered).toHaveLength(1);
      expect(rendered[0]).toBe("FIRST");
    });
  });

  describe("Invariant 11: empty markers → empty result", () => {
    // Defensive baseline — locks that `buildRenderList([], any, any)`
    // never spawns a phantom element.
    test.prop([arbDottedName, arbAlphaSegmentName], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildRenderList([], routeName, nodeName) === []",
      (routeName, nodeName) => {
        const rendered = buildRenderList([], routeName, nodeName);

        expect(rendered).toStrictEqual([]);
      },
    );
  });
});

// =============================================================================
// collectElements — flatten + marker-filter (§6.4 №6, §6.5 №5)
// =============================================================================

// `collectElements` is recursive over arbitrarily-nested JSX children with a
// mutable result accumulator. It MUST: ignore non-marker values silently,
// flatten any depth, preserve traversal order, and treat null/undefined as
// no-op. None of these properties was covered before — they are exactly
// what Solid's JSX runtime delivers in real usage (string children, nested
// fragments, conditional `&&` branches, etc.).
describe("collectElements — Property Tests (§6.4 №6, §6.5 №5)", () => {
  const sampleMatch = (id: string): RouteViewMarker => ({
    $$type: MATCH_MARKER,
    segment: id,
    exact: false,
    children: id as never,
    fallback: undefined,
  });

  describe("null-safe: null/undefined input is a no-op", () => {
    test("collectElements(null, []) does not throw and leaves result empty", () => {
      const result: RouteViewMarker[] = [];

      collectElements(null, result);

      expect(result).toStrictEqual([]);
    });

    test("collectElements(undefined, []) does not throw and leaves result empty", () => {
      const result: RouteViewMarker[] = [];

      collectElements(undefined, result);

      expect(result).toStrictEqual([]);
    });
  });

  describe("non-marker tolerance: primitives/strings/random objects are silently ignored", () => {
    // Solid's JSX runtime may pass strings, numbers, booleans, or arbitrary
    // objects through children when consumers mix marker-children with
    // plain JSX. The collector must filter without crashing.
    test.prop(
      [
        fc.array(
          fc.oneof(
            fc.string({ maxLength: 8 }),
            fc.integer(),
            fc.boolean(),
            fc.constantFrom(null, undefined),
            fc.record({ random: fc.constant(true) }),
          ),
          { maxLength: 6 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )("non-marker inputs are dropped, result stays empty", (junk) => {
      const result: RouteViewMarker[] = [];

      collectElements(junk, result);

      expect(result).toStrictEqual([]);
    });
  });

  describe("order preservation: result mirrors traversal order", () => {
    // collectElements pushes markers in the order it encounters them via
    // for-of over arrays. Property: shuffling the input produces a result
    // in the same shuffled order.
    test.prop(
      [fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 6 })],
      {
        numRuns: NUM_RUNS.standard,
      },
    )("markers appear in result in the same order as in input", (ids) => {
      const markers = ids.map((id) => sampleMatch(id));
      const result: RouteViewMarker[] = [];

      collectElements(markers, result);

      expect(result).toHaveLength(markers.length);

      result.forEach((m, i) => {
        expect(m).toBe(markers[i]);
      });
    });
  });

  describe("concat homomorphism: collect(left ∥ right) ≡ collect(left) ∥ collect(right)", () => {
    // Fundamental flatten-collect property. If a refactor changes the
    // traversal (e.g. switches to a non-depth-first walk or pushes
    // sub-arrays in reverse), this invariant fails immediately.
    test.prop(
      [
        fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 4 }),
        fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 4 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )("concatenated input yields concatenated output", (leftIds, rightIds) => {
      const left = leftIds.map((id) => sampleMatch(id));
      const right = rightIds.map((id) => sampleMatch(id));

      const both: RouteViewMarker[] = [];

      collectElements([...left, ...right], both);

      const onlyLeft: RouteViewMarker[] = [];

      collectElements(left, onlyLeft);
      const onlyRight: RouteViewMarker[] = [];

      collectElements(right, onlyRight);

      expect(both).toStrictEqual([...onlyLeft, ...onlyRight]);
    });
  });

  describe("arbitrary nesting: nested arrays of any depth flatten correctly", () => {
    // Solid's JSX can produce children like `[[m1, [m2]], m3]` via
    // <For>/conditional rendering nesting. The recursive `Array.isArray`
    // walk must flatten any depth without changing order.
    test("triple-nested arrays flatten to the same flat list", () => {
      const m1 = sampleMatch("a");
      const m2 = sampleMatch("b");
      const m3 = sampleMatch("c");

      const nested = [[m1, [m2, [m3]]]];
      const result: RouteViewMarker[] = [];

      collectElements(nested, result);

      expect(result).toStrictEqual([m1, m2, m3]);
    });
  });
});
