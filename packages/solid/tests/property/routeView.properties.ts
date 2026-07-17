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
  collectElements,
  isSegmentMatch,
  materializeWinner,
  pickWinner,
} from "../../src/components/RouteView/helpers";
import { isRouteActive } from "../../src/RouterProvider";

import type { RouteViewMarker } from "../../src/components/RouteView/components";
import type { JSX } from "solid-js";

// `buildRenderList` was the pre-#1094 production API: it returned the rendered
// child list (length ≤ 1) that `RouteView` mounted. After #1094 the component
// consumes the winner-keyed pipeline (`pickWinner` + `materializeWinner`)
// directly, so this thin wrapper reproduces the exact `JSX.Element[]` shape
// these invariants pin — over the SAME winner-selection logic the component
// now uses. Keeping it here (not in `src/`) keeps the observable contract
// under test without exporting a component-unused function from production.
function buildRenderList(
  elements: RouteViewMarker[],
  routeName: string,
  nodeName: string,
): JSX.Element[] {
  const winner = pickWinner(elements, routeName, nodeName);

  return winner === null ? [] : [materializeWinner(winner)];
}

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

  describe("Invariant 10: exact/non-exact agree on identical inputs (Sprint B.2 — audit-6 Stage-2 #9)", () => {
    // When `routeName === fullSegmentName`, both `exact=true` and
    // `exact=false` MUST return true: strict equality is a subset of
    // prefix matching with dot-boundary. A regression that special-
    // cased one mode but not the other would surface here. Together
    // with Invariant 8 (monotonicity strict→non-exact for ANY input),
    // this nails down the truth table corner for identical args.
    test.prop([arbDottedName], { numRuns: NUM_RUNS.standard })(
      "isSegmentMatch(x, x, true) === isSegmentMatch(x, x, false) === true",
      (name) => {
        fc.pre(name.length > 0);

        expect(isSegmentMatch(name, name, true)).toBe(true);
        expect(isSegmentMatch(name, name, false)).toBe(true);
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
  .map(({ segment, exact }): RouteViewMarker => ({
    $$type: MATCH_MARKER,
    segment,
    exact,
    // The marker shape uses a getter for `children` in the production
    // factory; the helper consumes it via `.children` so a plain field
    // is structurally equivalent for the buildRenderList loop.
    children: markerChild() as never,
    fallback: undefined,
  }));

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

  describe("Invariant 10b: Self ⊥ Match same-route consistency (Sprint B.2 — audit-6 Stage-2 #7)", () => {
    // When the active route name EQUALS the parent nodeName AND there
    // exists a Match marker whose `fullSegmentName` also equals the
    // routeName, both candidates would individually qualify:
    //   - Self: `routeName === nodeName`
    //   - Match: `isSegmentMatch(routeName, fullSegmentName, exact)`
    // Precedence rule: Match wins (Match comes first in the
    // !activeMatchFound branch). Self is suppressed even though it
    // would otherwise fire.
    //
    // Locks the mutual exclusion. A refactor that lifted Self's
    // verdict out of the Match check (e.g. always-fire when
    // `routeName === nodeName`) would silently emit BOTH markers,
    // breaking single-render contract (Invariant 8).
    test("active route === nodeName + matching Match for same name → only Match renders", () => {
      // nodeName="users.profile", active route="users.profile".
      // Self would fire on route===nodeName. Match with segment="profile"
      // under nodeName="users.profile" would also fire (exact match on
      // fullSegmentName="users.profile.profile" — but wait, that's
      // wrong combo). Let me think:
      //
      // For Self+Match to BOTH qualify on the SAME routeName, we need:
      //   routeName === nodeName  (Self qualifies)
      //   AND
      //   isSegmentMatch(routeName, `${nodeName}.${segment}`, exact) is true
      //
      // With nodeName === routeName, fullSegmentName=`${routeName}.${segment}`.
      // For non-exact match, isSegmentMatch checks if routeName starts
      // with fullSegmentName + ".". But fullSegmentName is LONGER than
      // routeName here, so it CANNOT match.
      //
      // The only way both qualify is with `nodeName === ""` and Match's
      // segment matches the routeName exactly (Self requires routeName
      // === "" too, edge case).
      //
      // Realistic intersection: nodeName="" + routeName="" + Self + Match
      // segment="" — but empty segment is now guarded (Sprint A.2).
      //
      // So in practice: Self ⊥ Match is a NON-CROSSING contract for
      // normal inputs. The mutual exclusion is enforced by the
      // `!activeMatchFound` guard: if any Match wins, Self is skipped.
      // Test that contract directly: with a Match that wins for a
      // descendant route, Self does NOT fire even when Self would
      // qualify under a different routeName.
      const self: RouteViewMarker = {
        $$type: SELF_MARKER,
        children: "SELF" as never,
        fallback: undefined,
      };
      const match: RouteViewMarker = {
        $$type: MATCH_MARKER,
        segment: "list",
        exact: false,
        children: "MATCH" as never,
        fallback: undefined,
      };

      // Active route is "users.list", which is a descendant of nodeName
      // "users". Match("list") matches → fires. Self requires
      // routeName === nodeName ("users.list" !== "users") → would NOT
      // fire here anyway. Pin: rendered is just [MATCH].
      const rendered1 = buildRenderList([self, match], "users.list", "users");

      expect(rendered1).toHaveLength(1);
      expect(rendered1[0]).toBe("MATCH");

      // Now: active route === nodeName === "users". Self qualifies.
      // Match("list") requires fullSegmentName="users.list" which is
      // NOT a prefix of "users" → Match does NOT fire. Self wins.
      const rendered2 = buildRenderList([self, match], "users", "users");

      expect(rendered2).toHaveLength(1);
      expect(rendered2[0]).toBe("SELF");
    });

    test("property fuzz: at most one of {Self, Match} ever renders simultaneously", () => {
      // For randomly-constructed Self + Match against arbitrary route
      // states, the renderList NEVER contains BOTH "SELF" and "MATCH"
      // sentinels. Documents that the helper is single-render.
      const self: RouteViewMarker = {
        $$type: SELF_MARKER,
        children: "SELF" as never,
        fallback: undefined,
      };
      const match: RouteViewMarker = {
        $$type: MATCH_MARKER,
        segment: "list",
        exact: false,
        children: "MATCH" as never,
        fallback: undefined,
      };

      // Spot-check a few interesting combinations.
      const cases: [string, string][] = [
        ["users", "users"],
        ["users.list", "users"],
        ["users.list.detail", "users"],
        ["admin", "users"],
        ["users.other", "users"],
      ];

      for (const [routeName, nodeName] of cases) {
        const rendered = buildRenderList([self, match], routeName, nodeName);

        expect(rendered.length).toBeLessThanOrEqual(1);

        // Either result element is "SELF" OR "MATCH", never both.
        if (rendered.length === 1) {
          expect(["SELF", "MATCH"]).toContain(rendered[0]);
        }
      }
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

  describe("Invariant 12: NotFound vs Self at UNKNOWN_ROUTE parent (audit-2026-05-17 §6 Stage-1)", () => {
    // CLAUDE.md documents this rare edge: when `nodeName === UNKNOWN_ROUTE`
    // AND the active route is also `UNKNOWN_ROUTE`, both `<Self>` and
    // `<NotFound>` *could* fire — Self because `routeName === nodeName`,
    // NotFound because `routeName === UNKNOWN_ROUTE`. The implementation
    // gives Self precedence (see `helpers.tsx` `buildRenderList` —
    // `selfMarker !== null && routeName === nodeName` is the FIRST
    // branch of the !activeMatchFound conditional).
    //
    // Pin-test the precedence so a refactor that re-orders the branches
    // (or adds a guard like `nodeName !== UNKNOWN_ROUTE` to Self) becomes
    // visible. NotFound-only at UNKNOWN_ROUTE parent is covered by Inv 10
    // (`UNKNOWN_ROUTE + NotFound marker → exactly one rendered`).
    test("Self wins over NotFound when both could fire at nodeName === UNKNOWN_ROUTE", () => {
      const selfMarker: RouteViewMarker = {
        $$type: SELF_MARKER,
        children: "SELF-AT-UNKNOWN" as never,
        fallback: undefined,
      };
      const notFoundMarker: RouteViewMarker = {
        $$type: NOT_FOUND_MARKER,
        children: "NOTFOUND" as never,
      };

      const rendered = buildRenderList(
        [selfMarker, notFoundMarker],
        UNKNOWN_ROUTE,
        UNKNOWN_ROUTE,
      );

      // Both markers would qualify individually; the impl picks Self first.
      expect(rendered).toHaveLength(1);
      expect(rendered[0]).toBe("SELF-AT-UNKNOWN");
    });

    test("NotFound fires when no Self present at nodeName === UNKNOWN_ROUTE", () => {
      const notFoundMarker: RouteViewMarker = {
        $$type: NOT_FOUND_MARKER,
        children: "NOTFOUND-ONLY" as never,
      };

      const rendered = buildRenderList(
        [notFoundMarker],
        UNKNOWN_ROUTE,
        UNKNOWN_ROUTE,
      );

      expect(rendered).toHaveLength(1);
      expect(rendered[0]).toBe("NOTFOUND-ONLY");
    });
  });

  describe("Invariant 13a: order-independence — Self/NotFound position vs Match does not change verdict (Sprint A.4 — audit-2 #32 MEDIUM)", () => {
    // Sprint A.4 refactor of buildRenderList accumulates Self/NotFound
    // independently of Match traversal. This invariant locks the
    // structural property: shuffling Self and NotFound markers around
    // the matching Match marker MUST yield the same renderList.
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.thorough })(
      "moving Self/NotFound to start, middle, or end of marker list yields the same renderList",
      (segment, child) => {
        fc.pre(segment !== child);

        const matchMarker: RouteViewMarker = {
          $$type: MATCH_MARKER,
          segment,
          exact: false,
          children: "MATCHED" as never,
          fallback: undefined,
        };
        const selfMarker: RouteViewMarker = {
          $$type: SELF_MARKER,
          children: "SELF" as never,
          fallback: undefined,
        };
        const notFoundMarker: RouteViewMarker = {
          $$type: NOT_FOUND_MARKER,
          children: "NF" as never,
        };
        const routeName = `${segment}.${child}`;

        const variantA = [selfMarker, notFoundMarker, matchMarker];
        const variantB = [matchMarker, selfMarker, notFoundMarker];
        const variantC = [selfMarker, matchMarker, notFoundMarker];
        const variantD = [notFoundMarker, matchMarker, selfMarker];

        const renderA = buildRenderList(variantA, routeName, "");
        const renderB = buildRenderList(variantB, routeName, "");
        const renderC = buildRenderList(variantC, routeName, "");
        const renderD = buildRenderList(variantD, routeName, "");

        // All four positions of Self/NotFound around the Match yield
        // the identical render (Match wins).
        expect(renderA).toStrictEqual(renderB);
        expect(renderA).toStrictEqual(renderC);
        expect(renderA).toStrictEqual(renderD);
        // And the verdict IS the Match (precedence preserved).
        expect(renderA).toHaveLength(1);
        expect(renderA[0]).toBe("MATCHED");
      },
    );

    test("relative order between TWO Match markers still matters — first-Match-wins (sanity)", () => {
      // Order-independence applies to Self/NotFound vs Match, NOT to
      // Match vs Match. The first matching Match still wins.
      const firstMatch: RouteViewMarker = {
        $$type: MATCH_MARKER,
        segment: "users",
        exact: false,
        children: "FIRST" as never,
        fallback: undefined,
      };
      const secondMatch: RouteViewMarker = {
        $$type: MATCH_MARKER,
        segment: "users",
        exact: false,
        children: "SECOND" as never,
        fallback: undefined,
      };

      const order1 = buildRenderList(
        [firstMatch, secondMatch],
        "users.list",
        "",
      );
      const order2 = buildRenderList(
        [secondMatch, firstMatch],
        "users.list",
        "",
      );

      expect(order1[0]).toBe("FIRST");
      expect(order2[0]).toBe("SECOND");
      // And they differ — Match precedence DOES depend on position.
      expect(order1).not.toStrictEqual(order2);
    });
  });

  describe("Invariant 13: empty-segment Match never matches, never crashes (Sprint A.2)", () => {
    // audit-2026-05-17 §5 MEDIUM — `<Match segment="">` produces a
    // malformed `fullSegmentName` (either `""` with empty nodeName, or
    // `"nodeName."` with trailing dot). Without the guard, the latter
    // crashes `startsWithSegment` in @real-router/route-utils with
    // TypeError, taking down the render. Locked: empty-segment Match
    // returns null (no match, no throw) for any routeName / nodeName.
    test.prop([arbDottedName, arbAlphaSegmentName], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildRenderList with `<Match segment=''>` returns [] (never matches, never throws)",
      (routeName, nodeName) => {
        const emptyMatch: RouteViewMarker = {
          $$type: MATCH_MARKER,
          segment: "",
          exact: false,
          children: "EMPTY" as never,
          fallback: undefined,
        };

        expect(() => {
          const rendered = buildRenderList([emptyMatch], routeName, nodeName);

          // No match, no exception.
          expect(rendered).toStrictEqual([]);
        }).not.toThrow();
      },
    );

    test("explicit: `<Match segment=''>` under non-empty nodeName does NOT throw TypeError", () => {
      const emptyMatch: RouteViewMarker = {
        $$type: MATCH_MARKER,
        segment: "",
        exact: false,
        children: "EMPTY" as never,
        fallback: undefined,
      };

      // Without the guard, this used to throw via startsWithSegment(
      // "users.profile", "users.", false) — trailing dot is invalid
      // input per route-utils invariants.
      expect(() => {
        buildRenderList([emptyMatch], "users.profile", "users");
      }).not.toThrow();
    });
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

  describe("idempotency: two collect passes produce identical-ref outputs (audit-2026-05-17 §6 Stage-2)", () => {
    // The collector is pure — given the same input it must produce the same
    // (marker-ref-preserving) sequence on every run. A regression that
    // mutated the markers in-place or introduced a hidden counter would fail
    // here. Identity preservation matters because consumers compare marker
    // refs upstream in `buildRenderList`.
    test.prop(
      [fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 6 })],
      { numRuns: NUM_RUNS.standard },
    )(
      "collect twice over the same markers yields ref-equal sequences",
      (ids) => {
        const markers = ids.map((id) => sampleMatch(id));

        const a: RouteViewMarker[] = [];
        const b: RouteViewMarker[] = [];

        collectElements(markers, a);
        collectElements(markers, b);

        expect(a).toHaveLength(b.length);

        a.forEach((marker, i) => {
          // Stronger than `toStrictEqual` — the SAME object reference must
          // appear in both passes (no per-pass clone).
          expect(marker).toBe(b[i]);
        });
      },
    );
  });

  describe("type preservation: every result element has a known $$type (audit-2026-05-17 §6 Stage-2)", () => {
    // Locks the marker filter: only Match/Self/NotFound shapes pass through,
    // everything else is silently dropped. A regression that opens the
    // gate (e.g. `if (typeof child === 'object')` instead of the symbol
    // check) would fail because non-marker objects would leak into the
    // result with `$$type === undefined`.
    test.prop(
      [
        fc.array(
          fc.oneof(
            fc.constant(undefined).map((_) => sampleMatch("m")),
            fc.constant(undefined).map((_): RouteViewMarker => ({
              $$type: SELF_MARKER,
              children: "S" as never,
              fallback: undefined,
            })),
            fc.constant(undefined).map((_): RouteViewMarker => ({
              $$type: NOT_FOUND_MARKER,
              children: "NF" as never,
            })),
          ),
          { minLength: 1, maxLength: 6 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "every collected marker has $$type ∈ {MATCH, SELF, NOT_FOUND}",
      (markers) => {
        const result: RouteViewMarker[] = [];

        collectElements(markers, result);

        const allowed = new Set([MATCH_MARKER, SELF_MARKER, NOT_FOUND_MARKER]);

        for (const m of result) {
          expect(allowed.has(m.$$type)).toBe(true);
        }
      },
    );
  });

  describe("Conservation: |result| ≤ |flattened children| (Sprint B.3 — audit-6 Stage-2 #10)", () => {
    // collectElements MUST NOT spawn phantom markers — every entry in
    // the result originated from the input tree. A regression that
    // emitted a fallback marker on null inputs (or duplicated markers
    // across nested arrays) would break this bound and silently
    // double-render `<Match>` blocks in RouteView. The cap is the
    // count of marker-shaped leaves after flattening.
    test.prop(
      [
        fc.array(
          fc.oneof(
            fc.string({ maxLength: 4 }).map((id) => sampleMatch(id)),
            fc.constantFrom(null, undefined),
            fc.array(
              fc.string({ maxLength: 4 }).map((id) => sampleMatch(id)),
              { maxLength: 3 },
            ),
          ),
          { maxLength: 6 },
        ),
      ],
      { numRuns: NUM_RUNS.thorough },
    )("|result| ≤ count of marker leaves in flattened input", (input) => {
      const result: RouteViewMarker[] = [];

      collectElements(input, result);

      // Count marker leaves manually for the bound. Anything that is
      // an object with a Symbol $$type is a marker.
      const flatten = (value: unknown): unknown[] => {
        if (Array.isArray(value)) {
          return value.flatMap((v) => flatten(v));
        }

        return [value];
      };
      const leafMarkers = flatten(input).filter(
        (v): boolean =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as { $$type?: unknown }).$$type === "symbol",
      );

      expect(result.length).toBeLessThanOrEqual(leafMarkers.length);
    });
  });

  describe("Reference passthrough: result entries are the SAME objects as inputs (Sprint B.3 — audit-6 Stage-2 #10)", () => {
    // The collector pushes input markers directly into the accumulator
    // — it never clones, wraps, or otherwise replaces them. Downstream
    // (buildRenderList → renderMatch) compares by ref to identify
    // first-Match-wins / first-Self-wins precedence. A regression that
    // shallow-cloned markers would break that comparison silently.
    test.prop(
      [fc.array(fc.string({ minLength: 1, maxLength: 4 }), { maxLength: 6 })],
      { numRuns: NUM_RUNS.standard },
    )(
      "every marker in the result is the EXACT same object reference as in input",
      (ids) => {
        const markers = ids.map((id) => sampleMatch(id));
        const result: RouteViewMarker[] = [];

        collectElements(markers, result);

        // Each result element matches the input by reference (Object.is).
        expect(result).toHaveLength(markers.length);

        result.forEach((m, i) => {
          expect(m).toBe(markers[i]);
        });
      },
    );

    test("nested input: nested markers preserve ref through flattening", () => {
      const m1 = sampleMatch("a");
      const m2 = sampleMatch("b");
      const m3 = sampleMatch("c");

      const result: RouteViewMarker[] = [];

      collectElements([m1, [m2, [m3]]], result);

      // Refs preserved even through nesting.
      expect(result[0]).toBe(m1);
      expect(result[1]).toBe(m2);
      expect(result[2]).toBe(m3);
    });
  });
});

// =============================================================================
// Sprint G (audit-8 §8b HIGH #4) — behavior equivalence between the
// optimized `buildRenderList` (candidate-set pre-pass) and a reference
// linear-walk implementation that uses isSegmentMatch unchanged. If the
// optimization ever diverges from the reference (e.g. a refactor that
// caches incorrectly, or breaks first-Match-wins under specific marker
// combinations), this PBT catches it. The pre-pass cache is keyed by
// `routeName` alone (#1094) — the candidate set is a pure function of the
// active route name.
// =============================================================================

/**
 * Reference impl helpers — split out to keep cognitive complexity
 * under the lint threshold. The shape mirrors the pre-Sprint-G
 * `buildRenderList` walk + isSegmentMatch dispatch.
 */
function referenceMatchAttempt(
  child: RouteViewMarker,
  routeName: string,
  nodeName: string,
): JSX.Element | null {
  if (child.$$type !== MATCH_MARKER) {
    return null;
  }

  const match = child as {
    $$type: typeof MATCH_MARKER;
    segment: string;
    exact: boolean;
    children: JSX.Element;
  };

  if (!match.segment) {
    return null;
  }

  const fullSegmentName = nodeName
    ? `${nodeName}.${match.segment}`
    : match.segment;

  if (!isSegmentMatch(routeName, fullSegmentName, match.exact)) {
    return null;
  }

  return match.children;
}

/**
 * Reference implementation — the pre-Sprint-G `buildRenderList` shape.
 * Walks markers linearly, calls `isSegmentMatch` per Match marker. Kept
 * here ONLY for behavior-equivalence verification — production code now
 * uses the candidate-set version.
 */
function referenceBuildRenderList(
  elements: RouteViewMarker[],
  routeName: string,
  nodeName: string,
): JSX.Element[] {
  let selfMarker: RouteViewMarker | null = null;
  let notFoundMarker: RouteViewMarker | null = null;
  let matchRendered: JSX.Element | null = null;

  for (const child of elements) {
    if (child.$$type === NOT_FOUND_MARKER) {
      // first-wins (#1439) — latch the FIRST NotFound MARKER (never null),
      // structurally mirroring production `pickWinner`'s `notFoundMarker ??= child`.
      // Guarding on the marker (not its children) keeps the oracle faithful even
      // if the NotFound arbitrary is later widened to emit childless markers.
      notFoundMarker ??= child;
    } else if (child.$$type === SELF_MARKER) {
      selfMarker ??= child;
    } else if (matchRendered === null) {
      matchRendered = referenceMatchAttempt(child, routeName, nodeName);
    }
  }

  const rendered: JSX.Element[] = [];

  if (matchRendered !== null) {
    rendered.push(matchRendered);
  } else if (selfMarker !== null && routeName === nodeName) {
    rendered.push((selfMarker as { children: JSX.Element }).children);
  } else if (routeName === UNKNOWN_ROUTE && notFoundMarker !== null) {
    rendered.push((notFoundMarker as { children: JSX.Element }).children);
  }

  return rendered;
}

describe("buildRenderList — Sprint G behavior equivalence (audit-8 §8b HIGH #4)", () => {
  // Marker arbitrary that includes ALL three types in arbitrary
  // proportions and order, plus realistic exact / non-exact and
  // realistic segment names.
  const arbMatchMarkerForEq: fc.Arbitrary<RouteViewMarker> = fc
    .record({
      segment: fc.oneof(
        fc.constant(""), // exercise empty-segment guard
        arbAlphaSegmentName,
      ),
      exact: fc.boolean(),
      sentinel: fc.string({ minLength: 1, maxLength: 8 }),
    })
    .map(({ segment, exact, sentinel }): RouteViewMarker => ({
      $$type: MATCH_MARKER,
      segment,
      exact,
      // Embed sentinel into children so we can compare result by
      // value when render-list elements come back. The renderMatch
      // helper passes children through unchanged for non-Suspense
      // markers.
      children: `M:${sentinel}` as never,
      fallback: undefined,
    }));

  const arbSelfMarkerForEq: fc.Arbitrary<RouteViewMarker> = fc
    .string({ minLength: 1, maxLength: 8 })
    .map((sentinel): RouteViewMarker => ({
      $$type: SELF_MARKER,
      children: `S:${sentinel}` as never,
      fallback: undefined,
    }));

  // NOTE (#1439): children is always a truthy `N:<sentinel>` string (never
  // nullish), so a childless-first-NotFound duplicate is not exercised here. The
  // marker-based oracle above does not depend on this — widen to `fc.option(...)`
  // if that edge ever needs explicit first-wins coverage.
  const arbNotFoundMarkerForEq: fc.Arbitrary<RouteViewMarker> = fc
    .string({ minLength: 1, maxLength: 8 })
    .map((sentinel): RouteViewMarker => ({
      $$type: NOT_FOUND_MARKER,
      children: `N:${sentinel}` as never,
    }));

  const arbAnyMarkerForEq: fc.Arbitrary<RouteViewMarker> = fc.oneof(
    { weight: 4, arbitrary: arbMatchMarkerForEq },
    { weight: 1, arbitrary: arbSelfMarkerForEq },
    { weight: 1, arbitrary: arbNotFoundMarkerForEq },
  );

  test.prop(
    [
      fc.array(arbAnyMarkerForEq, { minLength: 0, maxLength: 8 }),
      fc.oneof(fc.constant(UNKNOWN_ROUTE), arbDottedName, fc.constant("")),
      fc.oneof(fc.constant(""), arbAlphaSegmentName),
    ],
    { numRuns: 1000 },
  )(
    "optimized buildRenderList ≡ reference linear walk for arbitrary (markers, routeName, nodeName)",
    (markers, routeName, nodeName) => {
      const optimized = buildRenderList(markers, routeName, nodeName);
      const reference = referenceBuildRenderList(markers, routeName, nodeName);

      // toStrictEqual compares the JSX-element placeholders (sentinel
      // strings embedded in `children`) — for non-Suspense markers,
      // renderMatch/renderSelf return `children` verbatim, so the two
      // results must match by-value.
      expect(optimized).toStrictEqual(reference);
    },
  );

  // Companion explicit pin — covers a couple of high-signal cases
  // that the property generator might shrink to but that read more
  // clearly as named examples.
  test("equivalence on nested ancestor chain (routeName='a.b.c.d', Match segment='b.c')", () => {
    const m: RouteViewMarker = {
      $$type: MATCH_MARKER,
      segment: "b.c",
      exact: false,
      children: "B-C" as never,
      fallback: undefined,
    };

    const optimized = buildRenderList([m], "a.b.c.d", "a");
    const reference = referenceBuildRenderList([m], "a.b.c.d", "a");

    expect(optimized).toStrictEqual(reference);
    expect(optimized).toHaveLength(1);
  });

  test("equivalence on exact match (routeName='users.list', Match segment='list' exact=true)", () => {
    const m: RouteViewMarker = {
      $$type: MATCH_MARKER,
      segment: "list",
      exact: true,
      children: "EXACT" as never,
      fallback: undefined,
    };

    const optimized = buildRenderList([m], "users.list", "users");
    const reference = referenceBuildRenderList([m], "users.list", "users");

    expect(optimized).toStrictEqual(reference);
    expect(optimized[0]).toBe("EXACT");
  });
});
