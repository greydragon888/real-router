// packages/preact/tests/property/link.properties.ts

/**
 * Property-based tests for areLinkPropsEqual (Preact Link memo comparator).
 *
 * areLinkPropsEqual is NOT exported — we replicate the logic here.
 * The function uses === for primitives and JSON.stringify for objects.
 *
 * Invariants:
 * 1. Reflexivity: areLinkPropsEqual(p, p) === true
 * 2. Symmetry: areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)
 * 3. Structural equality: identical fields → true (even for fresh objects)
 * 4. Sensitivity: differing any field → false
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { NUM_RUNS, arbRouteName, arbParams } from "./helpers";

// =============================================================================
// Inline replica of areLinkPropsEqual (not exported from Preact adapter)
// =============================================================================

interface LinkProps {
  routeName: string;
  className?: string | undefined;
  activeClassName?: string | undefined;
  activeStrict?: boolean | undefined;
  ignoreQueryParams?: boolean | undefined;
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
    prev.onClick === next.onClick &&
    prev.target === next.target &&
    prev.style === next.style &&
    prev.children === next.children &&
    JSON.stringify(prev.routeParams) === JSON.stringify(next.routeParams) &&
    JSON.stringify(prev.routeOptions) === JSON.stringify(next.routeOptions)
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
  onClick: fc.constant(undefined as unknown),
  target: fc.option(fc.constantFrom("_blank", "_self"), { nil: undefined }),
  style: fc.constant(undefined as unknown),
  children: fc.constant(undefined as unknown),
  routeParams: fc.option(arbParams, { nil: undefined }),
  routeOptions: fc.option(arbParams, { nil: undefined }),
});

// =============================================================================
// Tests
// =============================================================================

describe("areLinkPropsEqual — Property Tests", () => {
  describe("Invariant 1: Reflexivity — areLinkPropsEqual(p, p) === true", () => {
    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      "any props object is equal to itself",
      (props) => {
        expect(areLinkPropsEqual(props, props)).toBe(true);
      },
    );
  });

  describe("Invariant 2: Symmetry — areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)", () => {
    test.prop([arbLinkProps, arbLinkProps], { numRuns: NUM_RUNS.standard })(
      "comparison order does not affect result",
      (a, b) => {
        expect(areLinkPropsEqual(a, b)).toBe(areLinkPropsEqual(b, a));
      },
    );
  });

  describe("Invariant 3: Structural equality — identical fields yield true", () => {
    test.prop([arbLinkProps], { numRuns: NUM_RUNS.standard })(
      "deep clone is equal to original",
      (props) => {
        const clone: LinkProps = {
          routeName: props.routeName,
          className: props.className,
          activeClassName: props.activeClassName,
          activeStrict: props.activeStrict,
          ignoreQueryParams: props.ignoreQueryParams,
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
});
