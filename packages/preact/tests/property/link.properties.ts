// packages/preact/tests/property/link.properties.ts

/**
 * Property-based tests for areLinkPropsEqual (Preact Link memo comparator).
 *
 * areLinkPropsEqual is NOT exported — we replicate the logic here.
 * The function uses === for primitives and shallowEqual for routeParams/routeOptions.
 *
 * Invariants:
 * 1. Reflexivity: areLinkPropsEqual(p, p) === true
 * 2. Symmetry: areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)
 * 3. Structural equality (flat): identical primitive fields → true (even for fresh objects)
 * 4. Sensitivity: differing any compared field → false (per-field, not only routeName)
 * 5. `hash` prop sensitivity (#532): different hash on otherwise-identical props → false
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbHash,
  arbParams,
  arbRouteName,
  arbRouteNameWide,
} from "./helpers";
import { shallowEqual } from "../../src/dom-utils";

// =============================================================================
// Inline replica of areLinkPropsEqual (not exported from Preact adapter)
// =============================================================================

interface LinkProps {
  routeName: string;
  className?: string | undefined;
  activeClassName?: string | undefined;
  activeStrict?: boolean | undefined;
  ignoreQueryParams?: boolean | undefined;
  hash?: string | undefined;
  onClick?: unknown;
  target?: string | undefined;
  style?: unknown;
  children?: unknown;
  routeParams?: Record<string, unknown> | undefined;
  routeOptions?: Record<string, unknown> | undefined;
}

function areLinkPropsEqual(
  prev: Readonly<LinkProps>,
  next: Readonly<LinkProps>,
): boolean {
  return (
    prev.routeName === next.routeName &&
    prev.className === next.className &&
    prev.activeClassName === next.activeClassName &&
    prev.activeStrict === next.activeStrict &&
    prev.ignoreQueryParams === next.ignoreQueryParams &&
    prev.hash === next.hash &&
    prev.onClick === next.onClick &&
    prev.target === next.target &&
    prev.style === next.style &&
    prev.children === next.children &&
    shallowEqual(prev.routeParams, next.routeParams) &&
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

// =============================================================================
// Arbitraries
// =============================================================================

const arbLinkProps = fc.record({
  routeName: arbRouteName,
  className: fc.option(fc.string({ minLength: 0, maxLength: 20 }), {
    nil: undefined,
  }),
  activeClassName: fc.option(fc.string({ minLength: 0, maxLength: 20 }), {
    nil: undefined,
  }),
  activeStrict: fc.option(fc.boolean(), { nil: undefined }),
  ignoreQueryParams: fc.option(fc.boolean(), { nil: undefined }),
  hash: fc.option(arbHash, { nil: undefined }),
  onClick: fc.constant(undefined),
  target: fc.option(fc.constantFrom("_blank", "_self"), { nil: undefined }),
  style: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
    nil: undefined,
  }),
  children: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
    nil: undefined,
  }),
  routeParams: fc.option(arbParams, { nil: undefined }),
  routeOptions: fc.option(arbParams, { nil: undefined }),
});

// =============================================================================
// Tests
// =============================================================================

describe("areLinkPropsEqual — Property Tests", () => {
  describe("Invariant 1: Reflexivity — areLinkPropsEqual(p, p) === true", () => {
    test.prop([arbLinkProps], { numRuns: NUM_RUNS.thorough })(
      "any props object is equal to itself",
      (props) => {
        expect(areLinkPropsEqual(props, props)).toBe(true);
      },
    );
  });

  describe("Invariant 2: Symmetry — areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)", () => {
    test.prop([arbLinkProps, arbLinkProps], { numRuns: NUM_RUNS.thorough })(
      "comparison order does not affect result",
      (a, b) => {
        expect(areLinkPropsEqual(a, b)).toBe(areLinkPropsEqual(b, a));
      },
    );
  });

  describe("Invariant 3: Structural equality — identical fields yield true", () => {
    test.prop([arbLinkProps], { numRuns: NUM_RUNS.thorough })(
      "deep clone is equal to original",
      (props) => {
        const clone: LinkProps = {
          routeName: props.routeName,
          className: props.className,
          activeClassName: props.activeClassName,
          activeStrict: props.activeStrict,
          ignoreQueryParams: props.ignoreQueryParams,
          hash: props.hash,
          onClick: props.onClick,
          target: props.target,
          style: props.style,
          children: props.children,
          routeParams: props.routeParams ? { ...props.routeParams } : undefined,
          routeOptions: props.routeOptions
            ? { ...props.routeOptions }
            : undefined,
        };

        expect(areLinkPropsEqual(props, clone)).toBe(true);
      },
    );
  });

  describe("Invariant 4: Sensitivity — differing routeName yields false", () => {
    test.prop(
      [
        arbLinkProps,
        arbRouteName.filter((name) => name !== "home"),
        arbRouteName.filter((name) => name === "home"),
      ],
      { numRuns: NUM_RUNS.standard },
    )("different routeName makes props unequal", (base, nameA, nameB) => {
      const a = { ...base, routeName: nameA };
      const b = { ...base, routeName: nameB };

      expect(areLinkPropsEqual(a, b)).toBe(false);
    });
  });

  describe("Invariant 4b: Per-field sensitivity — flipping any single field yields false", () => {
    // Each row mutates exactly one field on an arbitrary base. The mutated
    // value is guaranteed to differ from the base (filter + fc.pre).
    // Iterating through every comparable field protects against regressions
    // that silently drop one field from the comparator's && chain.
    test.prop(
      [
        arbLinkProps,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("different className → false", (base, a, b) => {
      fc.pre(a !== b);

      expect(
        areLinkPropsEqual({ ...base, className: a }, { ...base, className: b }),
      ).toBe(false);
    });

    test.prop(
      [
        arbLinkProps,
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 10 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("different activeClassName → false", (base, a, b) => {
      fc.pre(a !== b);

      expect(
        areLinkPropsEqual(
          { ...base, activeClassName: a },
          { ...base, activeClassName: b },
        ),
      ).toBe(false);
    });

    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      "different activeStrict (true vs false) → false",
      (base) => {
        expect(
          areLinkPropsEqual(
            { ...base, activeStrict: true },
            { ...base, activeStrict: false },
          ),
        ).toBe(false);
      },
    );

    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      "different ignoreQueryParams (true vs false) → false",
      (base) => {
        expect(
          areLinkPropsEqual(
            { ...base, ignoreQueryParams: true },
            { ...base, ignoreQueryParams: false },
          ),
        ).toBe(false);
      },
    );

    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      "different target (_blank vs _self) → false",
      (base) => {
        expect(
          areLinkPropsEqual(
            { ...base, target: "_blank" },
            { ...base, target: "_self" },
          ),
        ).toBe(false);
      },
    );

    test.prop([arbLinkProps, arbParams, arbParams], {
      numRuns: NUM_RUNS.standard,
    })("different routeParams (shallow-distinct) → false", (base, a, b) => {
      // Force a shallow-distinct pair: differs in size, or in at least one
      // value at the same key. shallowEqual returns false unless both
      // conditions hold; we negate that.
      fc.pre(!shallowEqual(a, b));

      expect(
        areLinkPropsEqual(
          { ...base, routeParams: a },
          { ...base, routeParams: b },
        ),
      ).toBe(false);
    });

    test.prop([arbLinkProps, arbParams, arbParams], {
      numRuns: NUM_RUNS.standard,
    })("different routeOptions (shallow-distinct) → false", (base, a, b) => {
      fc.pre(!shallowEqual(a, b));

      expect(
        areLinkPropsEqual(
          { ...base, routeOptions: a },
          { ...base, routeOptions: b },
        ),
      ).toBe(false);
    });

    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      'different style ("a" vs "b") → false',
      (base) => {
        expect(
          areLinkPropsEqual({ ...base, style: "a" }, { ...base, style: "b" }),
        ).toBe(false);
      },
    );

    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      'different children ("a" vs "b") → false',
      (base) => {
        expect(
          areLinkPropsEqual(
            { ...base, children: "a" },
            { ...base, children: "b" },
          ),
        ).toBe(false);
      },
    );
  });

  describe("Invariant 5: `hash` prop sensitivity (#532)", () => {
    // <Link hash> drives navigateWithHash + active-state hash-awareness.
    // The comparator must reject a hash-only change so React/Preact memo
    // re-renders the Link (otherwise sibling tab Links would stay stale).
    test.prop([arbLinkProps, arbHash, arbHash], { numRuns: NUM_RUNS.thorough })(
      "differing hash on otherwise-identical props → false",
      (base, hashA, hashB) => {
        fc.pre(hashA !== hashB);

        const a = { ...base, hash: hashA };
        const b = { ...base, hash: hashB };

        expect(areLinkPropsEqual(a, b)).toBe(false);
      },
    );

    test.prop([arbLinkProps, arbHash], { numRuns: NUM_RUNS.standard })(
      "hash=undefined vs hash=defined → false",
      (base, hash) => {
        const a = { ...base, hash: undefined };
        const b = { ...base, hash };

        expect(areLinkPropsEqual(a, b)).toBe(false);
      },
    );

    test.prop([arbLinkProps, arbHash], { numRuns: NUM_RUNS.standard })(
      "identical hash → true (when other fields match)",
      (base, hash) => {
        const a = { ...base, hash };
        const b = { ...base, hash };

        expect(areLinkPropsEqual(a, b)).toBe(true);
      },
    );
  });

  describe("Invariant 6: Wide-depth routeName preserves reflexivity / sensitivity", () => {
    // `arbRouteName` is `constantFrom` over 6 names; review §2.4 flagged that
    // edge-route depths (single segment, 4–6 nested) are not exercised.
    // Reflexivity and routeName-sensitivity must hold across that wider depth.
    test.prop([arbLinkProps, arbRouteNameWide], { numRuns: NUM_RUNS.standard })(
      "reflexivity holds for wide-depth routeName",
      (base, deepName) => {
        const props = { ...base, routeName: deepName };

        expect(areLinkPropsEqual(props, props)).toBe(true);
      },
    );

    test.prop([arbLinkProps, arbRouteNameWide, arbRouteNameWide], {
      numRuns: NUM_RUNS.standard,
    })("different wide-depth routeNames → false", (base, nameA, nameB) => {
      fc.pre(nameA !== nameB);

      const a = { ...base, routeName: nameA };
      const b = { ...base, routeName: nameB };

      expect(areLinkPropsEqual(a, b)).toBe(false);
    });
  });

  describe("Invariant 7: nested routeParams compared by reference (documented gotcha)", () => {
    // CLAUDE.md L228-233: "Nested objects in params are not deep-compared —
    // consumers stabilize via useMemo if needed." This invariant locks the
    // shallowEqual semantics at the Link comparator boundary so a future
    // "improvement" can't silently switch to deep equality.
    test.prop([arbLinkProps, fc.integer({ min: -100, max: 100 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "structurally-identical nested params with distinct refs → false",
      (base, x) => {
        const a = { ...base, routeParams: { filters: { x } } };
        const b = { ...base, routeParams: { filters: { x } } };

        // Two fresh `{ filters: { x } }` literals — outer object differs by
        // ref, but shallowEqual descends only one level deep. Object.is on
        // the nested `filters` value returns false → re-render.
        expect(areLinkPropsEqual(a, b)).toBe(false);
      },
    );

    test.prop([arbLinkProps, fc.integer({ min: -100, max: 100 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "shared nested-params ref → true (useMemo stabilization scenario)",
      (base, x) => {
        const shared = { filters: { x } };
        const a = { ...base, routeParams: shared };
        const b = { ...base, routeParams: shared };

        expect(areLinkPropsEqual(a, b)).toBe(true);
      },
    );
  });
});
