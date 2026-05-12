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
 *   keepAlive sticky-activation and `alreadyActive` short-circuit. The
 *   shared `hasBeenActivated: Set<string>` is the persistence vehicle.
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

        // Pass 1: route activates the Match.
        const first = buildRenderList(
          elements,
          matchSegment,
          "",
          hasBeenActivated,
        );

        expect(first.activeMatchFound).toBe(true);
        expect(first.rendered).toHaveLength(1);
        expect(hasBeenActivated.has(matchSegment)).toBe(true);

        // Pass 2: different route, keepAlive must keep it in the render list.
        const second = buildRenderList(
          elements,
          otherSegment,
          "",
          hasBeenActivated,
        );

        expect(second.activeMatchFound).toBe(false);
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
