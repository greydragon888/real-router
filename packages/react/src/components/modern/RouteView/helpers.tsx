import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Activity, Children, Fragment, Suspense, isValidElement } from "react";

import { Match, NotFound, Self } from "./components";

import type { MatchProps, NotFoundProps, SelfProps } from "./types";
import type { ReactElement, ReactNode } from "react";

const MARKER_TYPES: ReadonlySet<unknown> = new Set([Match, Self, NotFound]);

interface FallbackSlots {
  selfChildren: ReactNode;
  selfFallback: ReactNode | undefined;
  selfFound: boolean;
  notFoundChildren: ReactNode;
}

// Fixed keys used by appendFallback to distinguish the Self / NotFound
// render slots from user-supplied <Match> children. Match render slots key
// off `fullSegmentName` instead — these two are the only synthetic keys.
const SELF_KEY = "__route-view-self__";
const NOT_FOUND_KEY = "__route-view-not-found__";

function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (fullSegmentName === "") {
    return false;
  }

  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
}

export function collectElements(
  children: ReactNode,
  result: ReactElement[],
): void {
  // Recurses into Fragment-like wrappers (anything that isn't Match / Self /
  // NotFound) to flatten the slot tree. No explicit depth guard: typical
  // RouteView shape is `<RouteView><Match/>...<NotFound/></RouteView>` —
  // depth ≤ 3 in real apps. A pathological hand-written tree of N Fragments
  // recurses N times; the call stack, not this function, is the bound.
  //
  // `Children.forEach` iterates without `Children.toArray`'s array allocation
  // and per-child clone-with-synthetic-key step. We don't read child.key here
  // (Match/Self/NotFound carry their own segment-derived keys further down),
  // so the cheaper iterator is functionally equivalent.
  // eslint-disable-next-line @eslint-react/no-children-for-each -- intentional: collectElements is a render-hot pipeline; toArray's array+key clone is wasteful here
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }

    if (MARKER_TYPES.has(child.type)) {
      result.push(child);
    } else {
      collectElements(
        (child.props as { readonly children: ReactNode }).children,
        result,
      );
    }
  });
}

function renderSlotElement(
  slotChildren: ReactNode,
  key: string,
  keepAlive: boolean,
  mode: "visible" | "hidden",
  fallback?: ReactNode,
): ReactElement {
  const content =
    fallback === undefined ? (
      slotChildren
    ) : (
      <Suspense fallback={fallback}>{slotChildren}</Suspense>
    );

  if (keepAlive) {
    return (
      <Activity mode={mode} key={key}>
        {content}
      </Activity>
    );
  }

  return <Fragment key={key}>{content}</Fragment>;
}

function recordFallback(child: ReactElement, slots: FallbackSlots): boolean {
  if (child.type === NotFound) {
    slots.notFoundChildren = (child.props as NotFoundProps).children;

    return true;
  }

  if (child.type === Self) {
    // First-wins: subsequent <Self> elements are ignored, mirroring NotFound.
    if (!slots.selfFound) {
      slots.selfChildren = (child.props as SelfProps).children;
      slots.selfFallback = (child.props as SelfProps).fallback;
      slots.selfFound = true;
    }

    return true;
  }

  return false;
}

function processMatch(
  child: ReactElement,
  routeName: string,
  nodeName: string,
  hasBeenActivated: ReadonlySet<string>,
  alreadyActive: boolean,
): { rendered: ReactElement | null; activatedName: string | null } {
  const matchProps = child.props as MatchProps;
  const { segment, exact = false, keepAlive = false, fallback } = matchProps;
  const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
  const isActive =
    !alreadyActive && isSegmentMatch(routeName, fullSegmentName, exact);

  if (isActive) {
    // The keepAlive Set is NOT mutated here — RouteView commits the activation
    // in a post-render effect (#1251). Mutating during render coupled the pure
    // winner computation to a side effect (blocking memoization) and, under
    // concurrent rendering, a discarded render would leave a phantom entry that
    // later renders an un-committed match as a hidden keepAlive subtree.
    return {
      rendered: renderSlotElement(
        matchProps.children,
        fullSegmentName,
        keepAlive,
        "visible",
        fallback,
      ),
      activatedName: fullSegmentName,
    };
  }

  if (keepAlive && hasBeenActivated.has(fullSegmentName)) {
    return {
      rendered: renderSlotElement(
        matchProps.children,
        fullSegmentName,
        keepAlive,
        "hidden",
        fallback,
      ),
      activatedName: null,
    };
  }

  return { rendered: null, activatedName: null };
}

function appendFallback(
  rendered: ReactElement[],
  routeName: string,
  nodeName: string,
  slots: FallbackSlots,
): void {
  if (slots.selfFound && routeName === nodeName) {
    rendered.push(
      renderSlotElement(
        slots.selfChildren,
        SELF_KEY,
        false,
        "visible",
        slots.selfFallback,
      ),
    );

    return;
  }

  if (routeName === UNKNOWN_ROUTE && slots.notFoundChildren !== null) {
    rendered.push(
      <Fragment key={NOT_FOUND_KEY}>{slots.notFoundChildren}</Fragment>,
    );
  }
}

export function buildRenderList(
  elements: ReactElement[],
  routeName: string,
  nodeName: string,
  hasBeenActivated: ReadonlySet<string>,
): {
  rendered: ReactElement[];
  activeMatchFound: boolean;
  activatedName: string | null;
} {
  const slots: FallbackSlots = {
    selfChildren: null,
    selfFallback: undefined,
    selfFound: false,
    notFoundChildren: null,
  };
  // The segment that activated this render, or null. Reported to the caller so
  // RouteView can commit it to the keepAlive Set post-render (#1251) — this pure
  // walk no longer mutates the Set. At most one match activates (first-wins via
  // the `alreadyActive` short-circuit), so a single name suffices.
  let activatedName: string | null = null;
  const rendered: ReactElement[] = [];

  for (const child of elements) {
    if (recordFallback(child, slots)) {
      continue;
    }

    const result = processMatch(
      child,
      routeName,
      nodeName,
      hasBeenActivated,
      activatedName !== null,
    );

    if (result.activatedName !== null) {
      activatedName = result.activatedName;
    }

    if (result.rendered !== null) {
      rendered.push(result.rendered);
    }
  }

  if (activatedName === null) {
    appendFallback(rendered, routeName, nodeName, slots);
  }

  return { rendered, activeMatchFound: activatedName !== null, activatedName };
}
