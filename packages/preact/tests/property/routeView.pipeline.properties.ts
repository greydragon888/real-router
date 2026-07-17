// packages/preact/tests/property/routeView.pipeline.properties.ts

/**
 * Property-based tests for the RouteView render pipeline.
 *
 * Targets the internal stages of `<RouteView>`:
 *
 * - `collectElements(children, result)` — flattens `<Fragment>` wrappers and
 *   captures `<Match>` / `<Self>` / `<NotFound>` children into a flat array.
 *   Invariants: source-order preservation, post-recursion flatness.
 * - `buildRenderList(elements, routeName, nodeName)` — walks the collected
 *   elements, recording fallback slots and processing matches. Invariants:
 *   determinism, first-match wins, first-Self wins, Self priority over
 *   NotFound, activeMatchFound precludes fallback, NotFound only on
 *   UNKNOWN_ROUTE.
 * - `processMatch` / `appendFallback` (private; reached via `buildRenderList`)
 *   — `alreadyActive` short-circuit and Self/NotFound slot precedence.
 *
 * Closes §6 review items:
 * - Inv 7 (buildRenderList: determinism + first-match-wins)
 * - Inv 8 (appendFallback: Self-priority over NotFound)
 *
 * Preact differs from React: no `keepAlive` / `<Activity>` integration and no
 * `hasBeenActivated: Set<string>` parameter on `buildRenderList`. Tests omit
 * the keepAlive invariants present in `packages/react`.
 *
 * Note: `environment: "node"` is set by the property-test vitest config, so
 * elements are constructed via `h` (Preact's hyperscript) instead of JSX.
 */

import { test, fc } from "@fast-check/vitest";
import { UNKNOWN_ROUTE } from "@real-router/core";
import { Fragment, h } from "preact";
import { describe, expect } from "vitest";

import { arbSegmentName, NUM_RUNS } from "./helpers";
import {
  Match,
  NotFound,
  Self,
} from "../../src/components/RouteView/components";
import {
  buildRenderList,
  collectElements,
} from "../../src/components/RouteView/helpers";

import type { ComponentChildren, VNode } from "preact";

// =============================================================================
// arbRouteMatchTree — generators for VNode trees made of Match/Self/NotFound.
// Kept colocated with the property tests since these arbitraries are
// pipeline-specific and have no other consumers in `helpers.ts`.
// =============================================================================

// `h()`'s inferred `VNode<T>` carries the specific props shape and clashes
// with the generic `VNode` used throughout the pipeline helpers under
// `exactOptionalPropertyTypes`. The cast widens the return to the
// pipeline-friendly `VNode` shape used by `buildRenderList` / `collectElements`.
function makeMatch(
  segment: string,
  options: {
    exact?: boolean;
    fallback?: ComponentChildren;
    marker?: string;
  } = {},
): VNode {
  return h(Match, {
    segment,
    exact: options.exact ?? false,
    fallback: options.fallback,
    children: h("div", { "data-marker": options.marker ?? segment }),
  }) as unknown as VNode;
}

function makeSelf(marker = "self"): VNode {
  return h(Self, {
    children: h("div", { "data-marker": marker }),
  }) as unknown as VNode;
}

function makeNotFound(marker = "not-found"): VNode {
  return h(NotFound, {
    children: h("div", { "data-marker": marker }),
  }) as unknown as VNode;
}

const arbMatchElement: fc.Arbitrary<VNode> = fc
  .record({
    segment: arbSegmentName,
    exact: fc.boolean(),
  })
  .map(({ segment, exact }) => makeMatch(segment, { exact }));

const arbSelfElement: fc.Arbitrary<VNode> = fc
  .nat({ max: 32 })
  .map((n) => makeSelf(`self-${n}`));

const arbNotFoundElement: fc.Arbitrary<VNode> = fc
  .nat({ max: 32 })
  .map((n) => makeNotFound(`nf-${n}`));

const arbLeafElement: fc.Arbitrary<VNode> = fc.oneof(
  { weight: 4, arbitrary: arbMatchElement },
  { weight: 1, arbitrary: arbSelfElement },
  { weight: 1, arbitrary: arbNotFoundElement },
);

/**
 * Flat list of Match/Self/NotFound elements — the most common input shape
 * for `buildRenderList`.
 */
const arbRouteMatchTree: fc.Arbitrary<VNode[]> = fc.array(arbLeafElement, {
  minLength: 0,
  maxLength: 6,
});

/**
 * Possibly Fragment-wrapped tree — exercises `collectElements` recursion.
 * Each layer may wrap leaves in `<Fragment>`, simulating the JSX patterns
 * users write when sharing route groups.
 */
const arbFragmentWrappedTree: fc.Arbitrary<ComponentChildren> = fc
  .array(arbLeafElement, { minLength: 0, maxLength: 6 })
  .chain((leaves) =>
    fc.oneof(
      fc.constant<ComponentChildren>(leaves),
      // Wrap the entire list in one Fragment.
      fc.constant<ComponentChildren>(h(Fragment, null, ...leaves)),
      // Split into two halves, wrap each in a Fragment.
      fc.constant<ComponentChildren>([
        h(
          Fragment,
          { key: "a" },
          ...leaves.slice(0, Math.floor(leaves.length / 2)),
        ),
        h(
          Fragment,
          { key: "b" },
          ...leaves.slice(Math.floor(leaves.length / 2)),
        ),
      ]),
    ),
  );

describe("RouteView pipeline — Property Tests", () => {
  // =============================================================================
  // Invariant 1 — collectElements: source-order preservation
  // =============================================================================

  describe("Invariant 1: collectElements preserves source order", () => {
    test.prop([arbRouteMatchTree], { numRuns: NUM_RUNS.thorough })(
      "result[i].type === input[i].type for every index",
      (input) => {
        const result: VNode[] = [];

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
        const result: VNode[] = [];

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
  // Invariant 3 (§6 Inv 7 part A) — buildRenderList: determinism
  // =============================================================================

  describe("Invariant 3: buildRenderList is deterministic (pure function)", () => {
    // Repeated calls with identical inputs must produce structurally identical
    // outputs. Regression: a stray Date/Math.random in the pipeline would
    // surface here. Pairs naturally with first-match-wins — a non-deterministic
    // pipeline would silently pick different "first" matches.
    test.prop([arbRouteMatchTree, arbSegmentName, arbSegmentName], {
      numRuns: NUM_RUNS.thorough,
    })(
      "two calls with same (elements, routeName, nodeName) → equal rendered length + activeMatchFound",
      (elements, routeName, nodeName) => {
        const r1 = buildRenderList(elements, routeName, nodeName);
        const r2 = buildRenderList(elements, routeName, nodeName);

        expect(r1.activeMatchFound).toBe(r2.activeMatchFound);
        expect(r1.rendered).toHaveLength(r2.rendered.length);

        // Element-wise: same `type` and same `key` per index (the only stable
        // fields on freshly constructed VNodes — `props` carries closures).
        for (const [i, element] of r1.rendered.entries()) {
          expect(r2.rendered[i].type).toBe(element.type);
          expect(r2.rendered[i].key).toBe(element.key);
        }
      },
    );
  });

  // =============================================================================
  // Invariant 4 (§6 Inv 7 part B) — buildRenderList: first-match wins
  // =============================================================================

  describe("Invariant 4: first-match wins across duplicate Match elements", () => {
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
        );

        expect(activeMatchFound).toBe(true);
        expect(rendered).toHaveLength(1);
      },
    );

    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.thorough })(
      "first Match activates → second Match with different matching segment is suppressed",
      (segmentA, segmentB) => {
        // Route name "A.B" matches BOTH `A` (non-exact) and `A.B`. After the
        // first Match wins, the second must be short-circuited by
        // `processMatch.alreadyActive`.
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
        );

        expect(activeMatchFound).toBe(true);
        expect(rendered).toHaveLength(1);
      },
    );
  });

  // =============================================================================
  // Invariant 5 — buildRenderList: first-<Self> wins
  // =============================================================================

  describe("Invariant 5: first <Self> wins when multiple Self elements present", () => {
    test.prop([arbSegmentName, fc.integer({ min: 2, max: 5 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "N copies of <Self> with routeName === nodeName → exactly one Self render",
      (nodeName, copies) => {
        const elements = Array.from({ length: copies }, (_, index) =>
          makeSelf(`self-copy-${index}`),
        );

        const { rendered } = buildRenderList(elements, nodeName, nodeName);

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
  // Invariant 6 (§6 Inv 8) — appendFallback: Self priority over NotFound
  // =============================================================================

  describe("Invariant 6: Self matches → NotFound never appended", () => {
    test.prop([arbSegmentName, fc.boolean()], { numRuns: NUM_RUNS.thorough })(
      "<Self>+<NotFound> with routeName === nodeName → only Self appears",
      (nodeName, includeExtraUnrelatedMatch) => {
        const elements: VNode[] = [makeSelf(), makeNotFound()];

        if (includeExtraUnrelatedMatch) {
          // Add a Match that does NOT activate (different segment).
          elements.push(makeMatch(`${nodeName}xother`));
        }

        const { rendered } = buildRenderList(elements, nodeName, nodeName);

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

    test("explicit §6 Inv 8 lock — order [Self, NotFound], routeName === nodeName", () => {
      // Direct quote of the review §6 Inv 8 example, locked verbatim. The
      // order-sensitivity in `appendFallback` (line 121 checks selfFound first)
      // is what makes Self win — a regression that flips the order would
      // silently break UX at node-match points (rare, but high-impact).
      const elements: VNode[] = [makeSelf("S"), makeNotFound("NF")];
      const { rendered } = buildRenderList(elements, "node", "node");

      expect(rendered).toHaveLength(1);
      expect(rendered[0].key).toBe("__route-view-self__");
    });

    test("strict collision — Self wins over NotFound when nodeName === UNKNOWN_ROUTE (#1439)", () => {
      // Genuine collision the weak routeName===nodeName cases above miss:
      // nodeName === UNKNOWN_ROUTE AND active route === UNKNOWN_ROUTE → BOTH Self
      // and NotFound qualify; appendFallback checks Self first → Self wins.
      // Mirror of the Solid adapter's Invariant 12.
      const elements: VNode[] = [makeSelf("S"), makeNotFound("NF")];
      const { rendered } = buildRenderList(
        elements,
        UNKNOWN_ROUTE,
        UNKNOWN_ROUTE,
      );

      expect(rendered).toHaveLength(1);
      expect(rendered[0].key).toBe("__route-view-self__");
    });

    test("NotFound order is irrelevant: [NotFound, Self], routeName === nodeName → still Self wins", () => {
      // `recordFallback` records both slots before `appendFallback` runs;
      // appendFallback then picks Self first regardless of source order.
      const elements: VNode[] = [makeNotFound("NF"), makeSelf("S")];
      const { rendered } = buildRenderList(elements, "node", "node");

      expect(rendered).toHaveLength(1);
      expect(rendered[0].key).toBe("__route-view-self__");
    });
  });

  // =============================================================================
  // Invariant 7 — buildRenderList: activeMatchFound precludes fallback
  // =============================================================================

  describe("Invariant 7: any Match activates → Self/NotFound suppressed", () => {
    test.prop([arbSegmentName, fc.boolean(), fc.boolean()], {
      numRuns: NUM_RUNS.thorough,
    })(
      "an activating Match suppresses both Self and NotFound regardless of order",
      (segment, includeSelf, includeNotFound) => {
        const elements: VNode[] = [makeMatch(segment)];

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
  // Invariant 8 — Cross-check: NotFound appended ONLY on UNKNOWN_ROUTE
  // =============================================================================

  describe("Invariant 8: NotFound is appended only when routeName === UNKNOWN_ROUTE", () => {
    test.prop([arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "non-UNKNOWN_ROUTE + no Match → NotFound is NOT in rendered",
      (routeName) => {
        // Ensure the route name doesn't accidentally equal UNKNOWN_ROUTE.
        fc.pre(routeName !== UNKNOWN_ROUTE);

        const elements = [makeNotFound()];
        const { rendered } = buildRenderList(elements, routeName, "");

        expect(rendered).toHaveLength(0);
      },
    );

    test("UNKNOWN_ROUTE + no Match → NotFound appended", () => {
      const elements = [makeNotFound()];
      const { rendered } = buildRenderList(elements, UNKNOWN_ROUTE, "");

      expect(rendered).toHaveLength(1);
      expect(rendered[0].key).toBe("__route-view-not-found__");
    });
  });
});
