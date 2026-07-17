// packages/react/tests/property/routeView.pipeline.properties.ts

/**
 * Property-based tests for the RouteView render pipeline (issue #626).
 *
 * Targets the three internal stages of `<RouteView>`:
 *
 * - `collectElements(children, result)` — flattens `<Fragment>` wrappers and
 *   captures `<Match>` / `<Self>` / `<NotFound>` children into a flat array.
 *   Invariants: source-order preservation, post-recursion flatness.
 * - `buildRenderList(elements, routeName, nodeName, hasBeenActivated)` —
 *   walks the collected elements, recording fallback slots and processing
 *   matches. Invariants: first-match wins, first-Self wins, Self priority
 *   over NotFound, activeMatchFound precludes fallback.
 * - `processMatch` (private; reached via `buildRenderList`) — handles the
 *   keepAlive sticky-activation and `alreadyActive` short-circuit. Since #1251
 *   the walk is pure: it READS `hasBeenActivated` (a `ReadonlySet`) for the
 *   hidden-render decision and REPORTS the activated segment via `activatedName`
 *   rather than mutating the Set — RouteView commits it in a post-render effect,
 *   so the keepAlive tests below simulate that commit between passes.
 *
 * The React-element generators here build well-formed trees without JSX
 * (vitest config is `environment: "node"` for property tests). Each
 * `<Match>`/`<Self>`/`<NotFound>` carries a marker child so we can audit
 * which leaf ended up in the rendered list when needed.
 */

import { test, fc } from "@fast-check/vitest";
import { UNKNOWN_ROUTE } from "@real-router/core";
import { createElement, Fragment } from "react";
import { describe, expect } from "vitest";

import { arbSegmentName, NUM_RUNS } from "./helpers";
import {
  Match,
  NotFound,
  Self,
} from "../../src/components/modern/RouteView/components";
import {
  buildRenderList,
  collectElements,
} from "../../src/components/modern/RouteView/helpers";

import type { ReactElement, ReactNode } from "react";

// =============================================================================
// arbRouteMatchTree — generators for ReactElement trees made of Match/Self/
// NotFound (issue #626 acceptance criterion). Kept colocated with the
// property tests since these arbitraries are React-specific and have no
// other consumers in `helpers.ts`.
// =============================================================================

function makeMatch(
  segment: string,
  options: {
    exact?: boolean;
    keepAlive?: boolean;
    fallback?: ReactNode;
    marker?: string;
  } = {},
): ReactElement {
  return createElement(Match, {
    segment,
    exact: options.exact ?? false,
    keepAlive: options.keepAlive ?? false,
    fallback: options.fallback,
    children: createElement("div", {
      "data-marker": options.marker ?? segment,
    }),
  });
}

function makeSelf(marker = "self"): ReactElement {
  return createElement(Self, {
    children: createElement("div", { "data-marker": marker }),
  });
}

function makeNotFound(marker = "not-found"): ReactElement {
  return createElement(NotFound, {
    children: createElement("div", { "data-marker": marker }),
  });
}

const arbMatchElement: fc.Arbitrary<ReactElement> = fc
  .record({
    segment: arbSegmentName,
    exact: fc.boolean(),
    keepAlive: fc.boolean(),
  })
  .map(({ segment, exact, keepAlive }) =>
    makeMatch(segment, { exact, keepAlive }),
  );

const arbSelfElement: fc.Arbitrary<ReactElement> = fc
  .nat({ max: 32 })
  .map((n) => makeSelf(`self-${n}`));

const arbNotFoundElement: fc.Arbitrary<ReactElement> = fc
  .nat({ max: 32 })
  .map((n) => makeNotFound(`nf-${n}`));

const arbLeafElement: fc.Arbitrary<ReactElement> = fc.oneof(
  { weight: 4, arbitrary: arbMatchElement },
  { weight: 1, arbitrary: arbSelfElement },
  { weight: 1, arbitrary: arbNotFoundElement },
);

/**
 * Flat list of Match/Self/NotFound elements. The most common input shape
 * for `buildRenderList`.
 */
const arbRouteMatchTree: fc.Arbitrary<ReactElement[]> = fc.array(
  arbLeafElement,
  { minLength: 0, maxLength: 6 },
);

/**
 * Possibly Fragment-wrapped tree — exercises `collectElements` recursion.
 * Each layer may wrap leaves in `<Fragment>`, simulating the JSX patterns
 * users write when sharing route groups.
 */
const arbFragmentWrappedTree: fc.Arbitrary<ReactNode> = fc
  .array(arbLeafElement, { minLength: 0, maxLength: 6 })
  .chain((leaves) =>
    fc.oneof(
      fc.constant<ReactNode>(leaves),
      // Wrap the entire list in one Fragment.
      fc.constant<ReactNode>(createElement(Fragment, { children: leaves })),
      // Split into two halves, wrap each in a Fragment.
      fc.constant<ReactNode>([
        createElement(Fragment, {
          key: "a",
          children: leaves.slice(0, Math.floor(leaves.length / 2)),
        }),
        createElement(Fragment, {
          key: "b",
          children: leaves.slice(Math.floor(leaves.length / 2)),
        }),
      ]),
    ),
  );

// =============================================================================
// Invariant 1 — collectElements: source-order preservation
// =============================================================================

describe("RouteView pipeline — Property Tests", () => {
  describe("Invariant 1: collectElements preserves source order", () => {
    test.prop([arbRouteMatchTree], { numRuns: NUM_RUNS.thorough })(
      "result[i].type === input[i].type for every index",
      (input) => {
        const result: ReactElement[] = [];

        collectElements(input, result);

        expect(result).toHaveLength(input.length);

        for (const [i, element] of input.entries()) {
          expect(result[i].type).toBe(element.type);
        }
      },
    );
  });

  // =============================================================================
  // Invariant 2 — collectElements: flatness post-recursion
  // =============================================================================

  describe("Invariant 2: collectElements result contains only Match/Self/NotFound", () => {
    test.prop([arbFragmentWrappedTree], { numRuns: NUM_RUNS.thorough })(
      "Fragments are flattened; result has no Fragment / array / DOM elements",
      (input) => {
        const result: ReactElement[] = [];

        collectElements(input, result);

        for (const element of result) {
          // Allowed: Match | Self | NotFound. Forbidden: Fragment, host
          // elements (string types like "div"), arrays.
          expect([Match, Self, NotFound]).toContain(element.type);
        }
      },
    );
  });

  // =============================================================================
  // Invariant 3 — buildRenderList: first-match wins (duplicate segments)
  // =============================================================================

  describe("Invariant 3: first-match wins across duplicate Match elements", () => {
    test.prop([arbSegmentName, fc.integer({ min: 2, max: 5 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "N copies of <Match segment=X> with routeName=X → only one render entry",
      (segment, copies) => {
        const elements = Array.from({ length: copies }, (_, index) =>
          makeMatch(segment, { marker: `copy-${index}` }),
        );

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          segment,
          "",
          new Set(),
        );

        expect(activeMatchFound).toBe(true);
        expect(rendered).toHaveLength(1);
      },
    );
  });

  // =============================================================================
  // Invariant 4 — buildRenderList: first-Self wins
  // =============================================================================

  describe("Invariant 4: first <Self> wins when multiple Self elements present", () => {
    test.prop([arbSegmentName, fc.integer({ min: 2, max: 5 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "N copies of <Self> with routeName === nodeName → exactly one Self render",
      (nodeName, copies) => {
        const elements = Array.from({ length: copies }, (_, index) =>
          makeSelf(`self-copy-${index}`),
        );

        const { rendered } = buildRenderList(
          elements,
          nodeName,
          nodeName,
          new Set(),
        );

        // Self renders under fixed key "__route-view-self__"; never more
        // than one such entry regardless of how many <Self> were collected.
        const selfEntries = rendered.filter(
          (element) => element.key === "__route-view-self__",
        );

        expect(selfEntries).toHaveLength(1);
        expect(rendered).toHaveLength(1);
      },
    );
  });

  // =============================================================================
  // Invariant 5 — buildRenderList: Self priority over NotFound
  // =============================================================================

  describe("Invariant 5: Self matches → NotFound never appended", () => {
    test.prop([arbSegmentName, fc.boolean()], { numRuns: NUM_RUNS.thorough })(
      "<Self>+<NotFound> with routeName === nodeName → only Self appears",
      (nodeName, includeExtraUnrelatedMatch) => {
        const elements: ReactElement[] = [makeSelf(), makeNotFound()];

        if (includeExtraUnrelatedMatch) {
          // Add a Match that does NOT activate (different segment).
          elements.push(makeMatch(`${nodeName}xother`));
        }

        const { rendered } = buildRenderList(
          elements,
          nodeName,
          nodeName,
          new Set(),
        );

        const hasSelf = rendered.some(
          (element) => element.key === "__route-view-self__",
        );
        const hasNotFound = rendered.some(
          (element) => element.key === "__route-view-not-found__",
        );

        expect(hasSelf).toBe(true);
        expect(hasNotFound).toBe(false);
      },
    );

    test("strict collision — Self wins over NotFound when nodeName === UNKNOWN_ROUTE (#1439)", () => {
      // The genuine collision the weak `routeName === nodeName` cases miss: when
      // nodeName is itself UNKNOWN_ROUTE and the active route is UNKNOWN_ROUTE,
      // BOTH Self (routeName === nodeName) and NotFound (routeName ===
      // UNKNOWN_ROUTE) qualify. `appendFallback` checks Self first → Self wins.
      // Mirror of the Solid adapter's Invariant 12.
      const { rendered } = buildRenderList(
        [makeSelf("S"), makeNotFound("NF")],
        UNKNOWN_ROUTE,
        UNKNOWN_ROUTE,
        new Set(),
      );

      expect(rendered).toHaveLength(1);
      expect(rendered[0].key).toBe("__route-view-self__");
    });
  });

  // =============================================================================
  // Invariant 6 — buildRenderList: activeMatchFound precludes fallback
  // =============================================================================

  describe("Invariant 6: any Match activates → Self/NotFound suppressed", () => {
    test.prop([arbSegmentName, fc.boolean(), fc.boolean()], {
      numRuns: NUM_RUNS.thorough,
    })(
      "an activating Match suppresses both Self and NotFound regardless of order",
      (segment, includeSelf, includeNotFound) => {
        const elements: ReactElement[] = [makeMatch(segment)];

        if (includeSelf) {
          elements.push(makeSelf());
        }

        if (includeNotFound) {
          elements.push(makeNotFound());
        }

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          segment,
          "",
          new Set(),
        );

        expect(activeMatchFound).toBe(true);

        for (const element of rendered) {
          expect(element.key).not.toBe("__route-view-self__");
          expect(element.key).not.toBe("__route-view-not-found__");
        }
      },
    );
  });

  // =============================================================================
  // Invariant 7 — processMatch: keepAlive sticky activation
  // =============================================================================

  describe("Invariant 7: keepAlive segment remains in hasBeenActivated", () => {
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.thorough })(
      "after first activation, segment stays activated; subsequent non-active route still renders it (hidden)",
      (matchSegment, otherSegment) => {
        fc.pre(matchSegment !== otherSegment);

        const elements = [makeMatch(matchSegment, { keepAlive: true })];
        const hasBeenActivated = new Set<string>();

        // Pass 1: route activates the Match. buildRenderList is now a pure walk
        // (#1251) — it REPORTS the activation via `activatedName` instead of
        // mutating the Set; RouteView commits it in a post-render effect.
        const first = buildRenderList(
          elements,
          matchSegment,
          "",
          hasBeenActivated,
        );

        expect(first.activeMatchFound).toBe(true);
        expect(first.activatedName).toBe(matchSegment);
        expect(first.rendered).toHaveLength(1);
        // Pure: the walk did NOT mutate the Set.
        expect(hasBeenActivated.has(matchSegment)).toBe(false);

        // Simulate RouteView's post-render effect committing the activation.
        hasBeenActivated.add(first.activatedName!);

        // Pass 2: different route; keepAlive reads the committed Set → hidden.
        const second = buildRenderList(
          elements,
          otherSegment,
          "",
          hasBeenActivated,
        );

        expect(second.activeMatchFound).toBe(false);
        expect(second.activatedName).toBeNull();
        expect(second.rendered).toHaveLength(1);
        // Sticky: still in the activated set.
        expect(hasBeenActivated.has(matchSegment)).toBe(true);
      },
    );

    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "keepAlive=false → segment NOT rendered after navigating away",
      (matchSegment, otherSegment) => {
        fc.pre(matchSegment !== otherSegment);

        const elements = [makeMatch(matchSegment, { keepAlive: false })];
        const hasBeenActivated = new Set<string>();

        buildRenderList(elements, matchSegment, "", hasBeenActivated);

        const second = buildRenderList(
          elements,
          otherSegment,
          "",
          hasBeenActivated,
        );

        // Without keepAlive, the no-match branch returns rendered=null.
        expect(second.rendered).toHaveLength(0);
      },
    );
  });

  // =============================================================================
  // Invariant 8 — processMatch: alreadyActive short-circuits
  // =============================================================================

  describe("Invariant 8: alreadyActive short-circuits subsequent matches", () => {
    test.prop([arbSegmentName], { numRuns: NUM_RUNS.thorough })(
      "two Match elements with the same segment → second NOT activated, only first rendered",
      (segment) => {
        const elements = [
          makeMatch(segment, { marker: "first" }),
          makeMatch(segment, { marker: "second" }),
        ];

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          segment,
          "",
          new Set(),
        );

        expect(activeMatchFound).toBe(true);
        expect(rendered).toHaveLength(1);
      },
    );

    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.thorough })(
      "first Match activates → second Match with different matching segment is suppressed",
      (segmentA, segmentB) => {
        // Activate the route name as A.B so that BOTH `A` (non-exact) and
        // `A.B` (exact or non-exact) would match. After first match wins,
        // the second must be short-circuited.
        fc.pre(segmentA !== segmentB);
        const routeName = `${segmentA}.${segmentB}`;

        const elements = [
          makeMatch(segmentA, { marker: "non-exact-parent" }),
          makeMatch(routeName, { marker: "would-match-too" }),
        ];

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          routeName,
          "",
          new Set(),
        );

        expect(activeMatchFound).toBe(true);
        // Only the first Match is rendered; the second is short-circuited
        // by the alreadyActive flag despite its segment also matching the
        // route name.
        expect(rendered).toHaveLength(1);
      },
    );
  });

  // =============================================================================
  // Bonus: NotFound is appended only when routeName === UNKNOWN_ROUTE
  // (cross-check; not in §626 list but tightens the fallback contract).
  // =============================================================================

  // =============================================================================
  // Invariant 9 — collectElements: recursion termination on deep Fragment nests
  // (review §6 LOW). Defends against an accidental refactor that swaps
  // Children.forEach for a custom iterator missing the termination case.
  // =============================================================================

  describe("Invariant 9: collectElements terminates on deeply nested Fragment trees (review §6 LOW)", () => {
    test.prop([fc.integer({ min: 1, max: 10 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "depth-N Fragment wrapping returns the inner Match — never infinite-recurses or throws",
      (depth) => {
        // Build N nested Fragments wrapping a single Match — depth-10 is the
        // empirical ceiling for hand-written route shapes; the function
        // must terminate within React's stack budget either way.
        let tree: ReactNode = createElement(Match, {
          segment: "leaf",
          exact: false,
          keepAlive: false,
          children: null,
        });

        for (let i = 0; i < depth; i++) {
          tree = createElement(Fragment, { key: `wrap-${i}`, children: tree });
        }

        const result: ReactElement[] = [];

        collectElements(tree, result);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe(Match);
      },
    );
  });

  // =============================================================================
  // Invariant 10 — buildRenderList: stability — same elements + routeName +
  // empty hasBeenActivated produce identical rendered lists across calls
  // (review §6 LOW). A regression to an internal cache that key-orders or
  // hashes by reference would silently break this.
  // =============================================================================

  describe("Invariant 10: buildRenderList is stable across identical calls (review §6 LOW)", () => {
    test.prop([arbRouteMatchTree, arbSegmentName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "calling twice with identical (elements, routeName, fresh hasBeenActivated) yields equal-shape outputs",
      (elements, routeName) => {
        const first = buildRenderList(elements, routeName, "", new Set());
        const second = buildRenderList(elements, routeName, "", new Set());

        // Shape equality: same length, same activeMatchFound, same per-index
        // element type and key. ReactElement instances are freshly created
        // per call (different references) so we deliberately don't compare
        // by `toStrictEqual` on the whole object.
        expect(second.rendered).toHaveLength(first.rendered.length);
        expect(second.activeMatchFound).toBe(first.activeMatchFound);

        for (let i = 0; i < first.rendered.length; i++) {
          expect(second.rendered[i].type).toBe(first.rendered[i].type);
          expect(second.rendered[i].key).toBe(first.rendered[i].key);
        }
      },
    );
  });

  // =============================================================================
  // Invariant 11 — processMatch: keepAlive set monotonicity (review §6 MED).
  // After a sequence of buildRenderList passes, the cumulative hasBeenActivated
  // set never loses an entry — each activated segment is sticky.
  // =============================================================================

  describe("Invariant 11: keepAlive hasBeenActivated set grows monotonically (review §6 MED)", () => {
    test.prop([fc.array(arbSegmentName, { minLength: 2, maxLength: 10 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "navigating through N distinct segments with keepAlive Match never removes a previously-activated segment",
      (segments) => {
        const uniqueSegments = [...new Set(segments)];

        fc.pre(uniqueSegments.length >= 2);

        // One <Match keepAlive> per unique segment. The render tree is
        // fixed; the routeName changes between passes.
        const elements = uniqueSegments.map((seg) =>
          makeMatch(seg, { keepAlive: true }),
        );

        const hasBeenActivated = new Set<string>();
        let previousSize = 0;

        for (const seg of uniqueSegments) {
          const { activatedName } = buildRenderList(
            elements,
            seg,
            "",
            hasBeenActivated,
          );

          // Simulate RouteView's post-render effect committing the activation
          // (#1251 — the pure walk reports it, the effect grows the Set).
          if (activatedName !== null) {
            hasBeenActivated.add(activatedName);
          }

          // After visiting `seg`, every previously-visited segment must
          // still be in the set.
          expect(hasBeenActivated.size).toBeGreaterThanOrEqual(previousSize);
          expect(hasBeenActivated.has(seg)).toBe(true);

          previousSize = hasBeenActivated.size;
        }

        // Final state: every visited segment is in the activated set.
        for (const seg of uniqueSegments) {
          expect(hasBeenActivated.has(seg)).toBe(true);
        }
      },
    );
  });

  // =============================================================================
  // Edge-case: large Match arrays (review §5 LOW) — buildRenderList walks
  // elements linearly. >20 Match was uncovered; this test stresses 50..120
  // elements to guard against an accidental O(n²) refactor.
  // =============================================================================

  describe("edge-case: buildRenderList with 50..120 Match elements (review §5 LOW)", () => {
    test.prop([fc.integer({ min: 50, max: 120 }), arbSegmentName], {
      numRuns: NUM_RUNS.standard,
    })(
      "first-match wins across N copies; large N does not break activation semantics",
      (n, activeSegment) => {
        const elements: ReactElement[] = Array.from({ length: n }, (_, i) =>
          makeMatch(`${activeSegment}-${i}`, { marker: `m-${i}` }),
        );

        // Insert one Match whose segment matches the active route at a
        // random-ish position so the linear walk has to skip many entries
        // before finding the activator.
        const insertAt = Math.floor(n / 2);

        elements.splice(insertAt, 0, makeMatch(activeSegment));

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          activeSegment,
          "",
          new Set(),
        );

        expect(activeMatchFound).toBe(true);
        expect(rendered).toHaveLength(1);
      },
    );

    test.prop(
      [fc.integer({ min: 50, max: 120 }), arbSegmentName, arbSegmentName],
      { numRuns: NUM_RUNS.standard },
    )(
      "no-match across N elements + no Self → NotFound rendered iff routeName === UNKNOWN_ROUTE",
      (n, segmentBase, routeName) => {
        fc.pre(segmentBase !== routeName && routeName !== UNKNOWN_ROUTE);

        const elements: ReactElement[] = Array.from({ length: n }, (_, i) =>
          makeMatch(`${segmentBase}-${i}`),
        );

        // Append a single NotFound at the end.
        elements.push(makeNotFound());

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          routeName,
          "",
          new Set(),
        );

        // None of the N Match elements activates, NotFound only fires on
        // UNKNOWN_ROUTE — for a regular routeName the render list is empty.
        expect(activeMatchFound).toBe(false);
        expect(rendered).toHaveLength(0);
      },
    );
  });

  // =============================================================================
  // Edge-case: processMatch keepAlive with falsy routeName (review §5 LOW).
  // `<Match keepAlive segment="x">` against `routeName=""` must NOT activate
  // (route name is empty → no match against any non-empty segment) AND must
  // NOT enter the keepAlive set. Guards against a regression where keepAlive
  // is misinterpreted as "always render".
  // =============================================================================

  describe("edge-case: processMatch keepAlive + falsy routeName (review §5 LOW)", () => {
    test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
      'routeName="" against <Match keepAlive segment="x"> → no activation, no sticky entry',
      (segment) => {
        const elements = [makeMatch(segment, { keepAlive: true })];
        const hasBeenActivated = new Set<string>();

        const { rendered, activeMatchFound } = buildRenderList(
          elements,
          "",
          "",
          hasBeenActivated,
        );

        expect(activeMatchFound).toBe(false);
        expect(rendered).toHaveLength(0);
        // Never-activated segment must not enter the keepAlive registry.
        expect(hasBeenActivated.size).toBe(0);
      },
    );

    test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "previously-activated keepAlive segment survives a transition through routeName='' (hidden render)",
      (segment) => {
        const elements = [makeMatch(segment, { keepAlive: true })];
        const hasBeenActivated = new Set<string>();

        // Pass 1: activate. buildRenderList reports the activation (#1251);
        // simulate RouteView's effect committing it to the Set.
        const first = buildRenderList(elements, segment, "", hasBeenActivated);

        expect(first.activeMatchFound).toBe(true);
        expect(first.activatedName).toBe(segment);

        hasBeenActivated.add(first.activatedName!);

        expect(hasBeenActivated.has(segment)).toBe(true);

        // Pass 2: transition through empty route name. The segment stays
        // in hasBeenActivated; renderSlotElement emits the hidden Activity.
        const second = buildRenderList(elements, "", "", hasBeenActivated);

        expect(second.activeMatchFound).toBe(false);
        expect(second.rendered).toHaveLength(1);
        expect(hasBeenActivated.has(segment)).toBe(true);
      },
    );
  });

  // =============================================================================
  // Invariant 14 — buildRenderList: first-NotFound wins (symmetric with #4)
  // =============================================================================

  describe("Invariant 14: first <NotFound> wins when multiple present (#1220)", () => {
    test.prop([fc.integer({ min: 2, max: 5 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "N copies of <NotFound> on UNKNOWN_ROUTE → exactly one render, carrying the FIRST NotFound's children",
      (copies) => {
        const elements = Array.from({ length: copies }, (_, index) =>
          makeNotFound(`nf-copy-${index}`),
        );

        const { rendered } = buildRenderList(
          elements,
          UNKNOWN_ROUTE,
          "",
          new Set(),
        );

        // Exactly one NotFound entry (fixed key) — symmetric with first-Self (#4).
        const notFoundEntries = rendered.filter(
          (element) => element.key === "__route-view-not-found__",
        );

        expect(notFoundEntries).toHaveLength(1);
        expect(rendered).toHaveLength(1);

        // First-wins IDENTITY: the rendered children come from the FIRST
        // <NotFound>, not the last. Count alone can't discriminate — last-wins
        // also yields exactly one entry; the marker is what proves first-wins
        // (#1220: recordFallback overwrote without a guard before the fix).
        const child = (
          notFoundEntries[0].props as { readonly children: ReactElement }
        ).children;

        expect(
          (child.props as { readonly "data-marker": string })["data-marker"],
        ).toBe("nf-copy-0");
      },
    );
  });

  describe("Cross-check: NotFound appended ONLY on UNKNOWN_ROUTE", () => {
    test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "non-UNKNOWN_ROUTE + no Match → NotFound is NOT in rendered",
      (routeName) => {
        // Ensure the route name doesn't accidentally equal UNKNOWN_ROUTE.
        fc.pre(routeName !== UNKNOWN_ROUTE);

        const elements = [makeNotFound()];
        const { rendered } = buildRenderList(
          elements,
          routeName,
          "",
          new Set(),
        );

        expect(rendered).toHaveLength(0);
      },
    );

    test("UNKNOWN_ROUTE + no Match → NotFound appended", () => {
      const elements = [makeNotFound()];
      const { rendered } = buildRenderList(
        elements,
        UNKNOWN_ROUTE,
        "",
        new Set(),
      );

      expect(rendered).toHaveLength(1);
      expect(rendered[0].key).toBe("__route-view-not-found__");
    });
  });
});
