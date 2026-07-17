// packages/vue/tests/property/routeView.pipeline.properties.ts

/**
 * Property-based tests for the Vue RouteView render pipeline.
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
 * - `evaluateMatch` / `appendFallback` (private; reached via `buildRenderList`)
 *   — `activeMatchFound` short-circuit and Self/NotFound slot precedence.
 *
 * Closes §2.2 review items:
 * - collectElements: order-preserving, Fragment-unwrapping, post-recursion flatness
 * - buildRenderList: first-match-wins, first-Self-wins, Self priority over NotFound,
 *   activeMatch suppresses fallbacks, NotFound only on UNKNOWN_ROUTE
 * - appendFallback: Self precedence locked via direct order-flip test
 *
 * Vue specifics vs Preact:
 * - `h` and `Fragment` come from "vue"; Fragment receives children as the
 *   second positional argument (an array).
 * - Vue's `buildRenderList` pushes the ORIGINAL child VNodes into `rendered`
 *   — not synthetic key-tagged wrappers. Marker identification is by
 *   `element.type === Match / Self / NotFound`, not by `element.key`.
 * - `recordFallback` stores the FIRST NotFound VNode (`slots.notFoundVNode ??= child`),
 *   so a Match-followed-by-multiple-NotFounds-with-UNKNOWN_ROUTE path is captured
 *   as "first NotFound wins" — symmetric with first-wins for Self/Match (#1439).
 */

import { test, fc } from "@fast-check/vitest";
import { UNKNOWN_ROUTE } from "@real-router/core";
import { describe, expect } from "vitest";
import { Fragment, h } from "vue";

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

import type { VNode } from "vue";

// =============================================================================
// Constructors — produce VNodes whose `type` matches Match/Self/NotFound.
// =============================================================================

function makeMatch(
  segment: string,
  options: {
    exact?: boolean;
    fallback?: VNode | (() => VNode);
    marker?: string;
  } = {},
): VNode {
  // Build props conditionally — Vue's typed `defineComponent` props reject
  // `undefined` for `fallback` under exactOptionalPropertyTypes. Pass the
  // key only when explicitly set, mirroring real consumer JSX/render-fn shape.
  // Cast via `unknown` because Vue's `h()` overloads infer strict prop shapes
  // from `defineComponent` — we want the runtime test path, not the
  // type-narrowed one.
  const props: Record<string, unknown> = {
    segment,
    exact: options.exact ?? false,
  };

  if (options.fallback !== undefined) {
    props.fallback = options.fallback;
  }

  return h(Match, props as unknown as { segment: string }, {
    default: () => h("div", { "data-marker": options.marker ?? segment }),
  });
}

function makeSelf(marker = "self"): VNode {
  return h(Self, {}, { default: () => h("div", { "data-marker": marker }) });
}

function makeNotFound(marker = "not-found"): VNode {
  return h(
    NotFound,
    {},
    { default: () => h("div", { "data-marker": marker }) },
  );
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
 * Each layer may wrap leaves in `<Fragment>`, simulating the patterns users
 * write when sharing route groups inside a slot's default function.
 *
 * Vue's `h(Fragment, ...)` accepts the children array as the SECOND
 * positional argument (different from React/Preact which spread varargs).
 */
const arbFragmentWrappedTree: fc.Arbitrary<unknown> = fc
  .array(arbLeafElement, { minLength: 0, maxLength: 6 })
  .chain((leaves) =>
    fc.oneof(
      fc.constant<unknown>(leaves),
      // Wrap the entire list in one Fragment.
      fc.constant<unknown>(h(Fragment, leaves)),
      // Split into two halves, wrap each in a Fragment.
      fc.constant<unknown>([
        h(Fragment, leaves.slice(0, Math.floor(leaves.length / 2))),
        h(Fragment, leaves.slice(Math.floor(leaves.length / 2))),
      ]),
    ),
  );

describe("RouteView pipeline — Property Tests (Vue)", () => {
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
      "Fragments are flattened; result has no Fragment / DOM elements",
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
  // Invariant 3 — buildRenderList: determinism
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

        // Element-wise: same `type` per index. Vue VNodes carry no stable
        // `key` field by default — comparing `.type` is sufficient to lock
        // the determinism contract.
        for (const [i, element] of r1.rendered.entries()) {
          expect(r2.rendered[i].type).toBe(element.type);
        }
      },
    );
  });

  // =============================================================================
  // Invariant 4 — buildRenderList: first-match wins
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
        // `activeMatchFound` (see helpers.ts line 155-157).
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

        // Exactly one Self vnode in rendered; `recordFallback` short-circuits
        // on `slots.selfVNode === null` after the first Self is captured.
        const selfEntries = rendered.filter((element) => element.type === Self);

        expect(selfEntries).toHaveLength(1);
        expect(rendered).toHaveLength(1);
      },
    );
  });

  // =============================================================================
  // Invariant 6 — appendFallback: Self priority over NotFound
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

        const hasSelf = rendered.some((element) => element.type === Self);
        const hasNotFound = rendered.some(
          (element) => element.type === NotFound,
        );

        expect(hasSelf).toBe(true);
        expect(hasNotFound).toBe(false);
      },
    );

    test("explicit lock — order [Self, NotFound], routeName === nodeName → only Self renders", () => {
      // Direct quote of the review item, locked verbatim. The order-sensitivity
      // in `appendFallback` (selfVNode is checked first) is what makes Self
      // win — a regression that flips the order would silently break UX at
      // node-match points (rare, but high-impact).
      const elements: VNode[] = [makeSelf("S"), makeNotFound("NF")];
      const { rendered } = buildRenderList(elements, "node", "node");

      expect(rendered).toHaveLength(1);
      expect(rendered[0].type).toBe(Self);
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
      expect(rendered[0].type).toBe(Self);
    });

    test("NotFound order is irrelevant: [NotFound, Self], routeName === nodeName → still Self wins", () => {
      // `recordFallback` records both slots before `appendFallback` runs;
      // appendFallback then picks Self first regardless of source order.
      const elements: VNode[] = [makeNotFound("NF"), makeSelf("S")];
      const { rendered } = buildRenderList(elements, "node", "node");

      expect(rendered).toHaveLength(1);
      expect(rendered[0].type).toBe(Self);
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
          expect(element.type).not.toBe(Self);
          expect(element.type).not.toBe(NotFound);
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
      expect(rendered[0].type).toBe(NotFound);
    });
  });

  // =============================================================================
  // Invariant 9 — appendFallback: first NotFound wins (cross-adapter, #1439)
  // =============================================================================

  describe("Invariant 9: first NotFound wins when multiple NotFounds present", () => {
    // Vue's `recordFallback` stores the FIRST `<RouteView.NotFound>` VNode
    // (`slots.notFoundVNode ??= child`) — so if a consumer accidentally renders
    // two `<RouteView.NotFound>` blocks, the FIRST one wins, symmetric with
    // first-wins for Self/Match and the React/Preact/Solid adapters (#1439).
    test("two NotFounds with UNKNOWN_ROUTE → only the first is rendered", () => {
      const first = makeNotFound("first");
      const second = makeNotFound("second");
      const elements: VNode[] = [first, second];

      const { rendered } = buildRenderList(elements, UNKNOWN_ROUTE, "");

      expect(rendered).toHaveLength(1);
      // The rendered vnode must be the FIRST of the two — locked by identity.
      expect(rendered[0]).toBe(first);
    });
  });

  // =============================================================================
  // Invariant 10 — evaluateMatch fullSegmentName construction
  // =============================================================================

  describe("Invariant 10: evaluateMatch builds fullSegmentName from nodeName + segment", () => {
    // `evaluateMatch` constructs `fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment`.
    // The two branches must both work correctly. This invariant guards against
    // a regression where the join character drifts (e.g. `/` instead of `.`)
    // or the empty-nodeName branch reverses.
    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "empty nodeName → fullSegmentName === segment (route matches segment directly)",
      (segment, otherSegment) => {
        fc.pre(segment !== otherSegment);

        // routeName === segment should match (nodeName=""); routeName === otherSegment must not.
        const elements = [makeMatch(segment)];
        const matching = buildRenderList(elements, segment, "");
        const nonMatching = buildRenderList(elements, otherSegment, "");

        expect(matching.activeMatchFound).toBe(true);
        expect(nonMatching.activeMatchFound).toBe(false);
      },
    );

    test.prop([arbSegmentName, arbSegmentName], { numRuns: NUM_RUNS.standard })(
      "non-empty nodeName → fullSegmentName === `${nodeName}.${segment}`",
      (nodeName, segment) => {
        fc.pre(nodeName !== segment);

        // With nodeName="users" and segment="list", routeName "users.list" should match.
        const routeName = `${nodeName}.${segment}`;
        const elements = [makeMatch(segment)];

        const result = buildRenderList(elements, routeName, nodeName);

        expect(result.activeMatchFound).toBe(true);
      },
    );
  });

  // =============================================================================
  // Invariant 11 — collectElements is idempotent on already-flat input
  // =============================================================================

  // Review §6 — NEW Inv (collectElements idempotency). After one `collectElements`
  // pass the result is a flat array of Match/Self/NotFound VNodes; a SECOND pass
  // over that flat array must produce a structurally identical result. Tests the
  // "passes through already-normalised input untouched" contract — a regression
  // that double-wraps or filters non-recursively on flat input would surface here.
  describe("Invariant 11: collectElements is idempotent on flat input", () => {
    test.prop([arbRouteMatchTree], { numRuns: NUM_RUNS.standard })(
      "collectElements(collectElements(x)) === collectElements(x) (element-wise type equality)",
      (input) => {
        const flat: VNode[] = [];

        collectElements(input, flat);

        const flat2: VNode[] = [];

        collectElements(flat, flat2);

        expect(flat2).toHaveLength(flat.length);

        for (const [i, element] of flat.entries()) {
          // Same VNode identity, not just same type — re-collection must not
          // rebuild wrapper VNodes.
          expect(flat2[i]).toBe(element);
        }
      },
    );
  });

  // =============================================================================
  // Invariant 12 — buildRenderList: hasPerMatchKA side-channel correctness
  // =============================================================================

  // Review §6 — NEW Inv (hasPerMatchKA). The `hasPerMatchKA` boolean returned
  // by `buildRenderList` must be `true` iff at least one `<Match>` child has its
  // `keepAlive` prop set to a Vue-accepted truthy form (`true`, `""`, `"keep-alive"`).
  // It is consumed by `RouteView` to decide whether the per-match KeepAlive
  // wrapper branch should fire even when the parent `<RouteView>` has no
  // `keepAlive` prop. A regression that misses a positive (e.g., short-circuits
  // on the first non-keepAlive match) silently disables per-match keepAlive.
  describe("Invariant 12: hasPerMatchKA reflects ANY Match child with truthy keepAlive", () => {
    test.prop(
      [
        fc.array(
          fc.record({
            segment: arbSegmentName,
            // Mix Vue-truthy and Vue-falsy shorthand forms — the side-channel
            // must accept all truthy forms and reject all falsy ones.
            keepAlive: fc.constantFrom<unknown>(
              true,
              "",
              "keep-alive",
              false,
              undefined,
              "false",
              0,
            ),
          }),
          { minLength: 0, maxLength: 6 },
        ),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "hasPerMatchKA === input.some(e => isKeepAliveEnabled(e.keepAlive))",
      (input) => {
        const elements = input.map(({ segment, keepAlive }) => {
          // Build a Match with `keepAlive` injected directly into props — the
          // makeMatch helper does not expose this prop, so construct via h()
          // directly. The marker-component identity check in collectElements
          // relies on `vnode.type === Match`, which `h(Match, ...)` satisfies.
          return h(
            Match,
            { segment, keepAlive } as unknown as { segment: string },
            { default: () => h("div") },
          );
        });
        // Use routeName "any" + empty nodeName — no match will activate (the
        // segments are random strings), so the loop walks every element.
        const { hasPerMatchKA } = buildRenderList(
          elements,
          "any-unmatchable",
          "",
        );
        const keepAliveValues: ReadonlySet<unknown> = new Set([
          true,
          "",
          "keep-alive",
        ]);
        const expected = input.some((entry) =>
          keepAliveValues.has(entry.keepAlive),
        );

        expect(hasPerMatchKA).toBe(expected);
      },
    );

    test("hasPerMatchKA === false when no Match children exist (Self/NotFound only)", () => {
      const elements = [makeSelf("a"), makeNotFound("nf")];
      const { hasPerMatchKA } = buildRenderList(elements, UNKNOWN_ROUTE, "");

      expect(hasPerMatchKA).toBe(false);
    });
  });

  // =============================================================================
  // Invariant 13 — First-match-wins is independent of `exact` prop on losers
  // =============================================================================

  // Review §6 — NEW Inv (first-match-wins independent of exact). When the first
  // Match in slot order activates, ALL subsequent Matches are suppressed
  // regardless of whether they have `exact: true` / `exact: false` / `exact`
  // omitted. The `activeMatchFound` short-circuit at `helpers.ts:186-188` is
  // the only guard; locking this invariant prevents a regression where the
  // pipeline scans the whole list and picks an "exact" match over the
  // textually-first one.
  describe("Invariant 13: first-match-wins ignores `exact` prop on losing candidates", () => {
    test.prop([arbSegmentName, fc.boolean(), fc.boolean()], {
      numRuns: NUM_RUNS.standard,
    })(
      "two identical-segment Matches: first wins, second's `exact` value is irrelevant",
      (segment, firstExact, secondExact) => {
        const first = makeMatch(segment, {
          exact: firstExact,
          marker: "first",
        });
        const second = makeMatch(segment, {
          exact: secondExact,
          marker: "second",
        });
        // routeName === segment guarantees the first Match activates (Inv 1
        // self-match) regardless of `exact` value.
        const { rendered } = buildRenderList([first, second], segment, "");

        expect(rendered).toHaveLength(1);
        expect(rendered[0]).toBe(first);
      },
    );
  });

  // =============================================================================
  // Invariant 14 — Fallback prop is forwarded by identity (VNode | function | undefined)
  // =============================================================================

  // Review §6 — NEW Inv (fallback type union). `Match.fallback` accepts the
  // union `VNode | (() => VNode) | undefined`. The pipeline must forward the
  // value verbatim (by identity) to the caller — no wrapping, no coercion, no
  // shape conversion. A regression that normalises (e.g., wraps a VNode in a
  // thunk) breaks the consumer-facing Suspense contract documented in
  // CLAUDE.md / README.
  describe("Invariant 14: fallback prop forwarded by identity", () => {
    test("VNode fallback passes through by reference", () => {
      const fb = h("div", { "data-marker": "spinner" });
      const m = makeMatch("x", { fallback: fb });
      const result = buildRenderList([m], "x", "");

      expect(result.fallback).toBe(fb);
    });

    test("function fallback passes through by reference", () => {
      const fb = () => h("div", { "data-marker": "spinner-fn" });
      const m = makeMatch("x", { fallback: fb });
      const result = buildRenderList([m], "x", "");

      expect(result.fallback).toBe(fb);
    });

    test("undefined fallback stays undefined (no Suspense wrapping)", () => {
      const m = makeMatch("x");
      const result = buildRenderList([m], "x", "");

      expect(result.fallback).toBeUndefined();
    });
  });
});
