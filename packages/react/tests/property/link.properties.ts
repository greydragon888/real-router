import { test, fc } from "@fast-check/vitest";

import {
  arbRouteName,
  arbParams,
  arbPrimitive,
  NUM_RUNS,
  type Primitive,
} from "./helpers";
import { shallowEqual } from "../../src/dom-utils/index.js";

// =============================================================================
// areLinkPropsEqual — replicated from src/components/Link.tsx
//
// The function is NOT exported (it's a module-scope comparator for memo()).
// We replicate the exact logic here to test its invariants.
// =============================================================================

interface LinkPropsLike {
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
  prev: Readonly<LinkPropsLike>,
  next: Readonly<LinkPropsLike>,
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
    shallowEqual(prev.routeParams, next.routeParams) &&
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

// =============================================================================
// Arbitraries
// =============================================================================

const arbClassName = fc.option(fc.string({ minLength: 0, maxLength: 20 }), {
  nil: undefined,
});

const arbTarget = fc.option(fc.constantFrom("_blank", "_self", "_parent"), {
  nil: undefined,
});

const arbLinkProps = fc.record({
  routeName: arbRouteName,
  className: arbClassName,
  activeClassName: arbClassName,
  activeStrict: fc.option(fc.boolean(), { nil: undefined }),
  ignoreQueryParams: fc.option(fc.boolean(), { nil: undefined }),
  onClick: fc.constant(undefined),
  target: arbTarget,
  style: fc.constant(undefined),
  children: fc.constant(undefined),
  routeParams: fc.option(arbParams, { nil: undefined }),
  routeOptions: fc.option(arbParams, { nil: undefined }),
});

// =============================================================================
// Reflexivity: areLinkPropsEqual(p, p) === true
// =============================================================================

describe("reflexivity: areLinkPropsEqual(p, p) === true", () => {
  test.prop([arbLinkProps], { numRuns: NUM_RUNS.thorough })(
    "any LinkProps is equal to itself",
    (props: LinkPropsLike) => {
      expect(areLinkPropsEqual(props, props)).toBe(true);
    },
  );
});

// =============================================================================
// Symmetry: areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)
// =============================================================================

describe("symmetry: areLinkPropsEqual(a, b) === areLinkPropsEqual(b, a)", () => {
  test.prop([arbLinkProps, arbLinkProps], { numRuns: NUM_RUNS.thorough })(
    "comparison is symmetric",
    (a: LinkPropsLike, b: LinkPropsLike) => {
      expect(areLinkPropsEqual(a, b)).toBe(areLinkPropsEqual(b, a));
    },
  );
});

// =============================================================================
// Single primitive prop change → false
// =============================================================================

describe("sensitivity: single primitive prop change → not equal", () => {
  test.prop([arbLinkProps, arbRouteName], { numRuns: NUM_RUNS.standard })(
    "changing routeName breaks equality",
    (props: LinkPropsLike, newRouteName: string) => {
      fc.pre(newRouteName !== props.routeName);

      const modified = { ...props, routeName: newRouteName };

      expect(areLinkPropsEqual(props, modified)).toBe(false);
    },
  );

  test.prop([arbLinkProps, fc.boolean()], { numRuns: NUM_RUNS.standard })(
    "changing activeStrict breaks equality",
    (props: LinkPropsLike, newValue: boolean) => {
      fc.pre(newValue !== props.activeStrict);

      const modified = { ...props, activeStrict: newValue };

      expect(areLinkPropsEqual(props, modified)).toBe(false);
    },
  );

  test.prop([arbLinkProps, arbPrimitive], { numRuns: NUM_RUNS.standard })(
    "changing className breaks equality",
    (props: LinkPropsLike, newValue: Primitive) => {
      const newClassName = String(newValue);

      fc.pre(newClassName !== props.className);

      const modified = { ...props, className: newClassName };

      expect(areLinkPropsEqual(props, modified)).toBe(false);
    },
  );
});

// =============================================================================
// Deep-equal routeParams with same key order → true
// =============================================================================

describe("deep-equal: routeParams with same key order → equal", () => {
  test.prop([arbLinkProps, arbParams], { numRuns: NUM_RUNS.thorough })(
    "identical routeParams objects compare as equal",
    (props: LinkPropsLike, params: Record<string, Primitive>) => {
      const a = { ...props, routeParams: { ...params } };
      const b = { ...props, routeParams: { ...params } };

      expect(areLinkPropsEqual(a, b)).toBe(true);
    },
  );

  test.prop([arbLinkProps, arbParams], { numRuns: NUM_RUNS.thorough })(
    "identical routeOptions objects compare as equal",
    (props: LinkPropsLike, options: Record<string, Primitive>) => {
      const a = { ...props, routeOptions: { ...options } };
      const b = { ...props, routeOptions: { ...options } };

      expect(areLinkPropsEqual(a, b)).toBe(true);
    },
  );
});
