import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Fragment, isValidElement, toChildArray } from "preact";
import { Suspense } from "preact/compat";

import { Match, NotFound, Self } from "./components";

import type { MatchProps, NotFoundProps, SelfProps } from "./types";
import type { VNode, ComponentChildren } from "preact";

const MARKER_TYPES: ReadonlySet<unknown> = new Set([Match, Self, NotFound]);

interface FallbackSlots {
  selfChildren: ComponentChildren;
  selfFallback: ComponentChildren | undefined;
  selfFound: boolean;
  notFoundChildren: ComponentChildren;
  notFoundFound: boolean;
}

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
  children: ComponentChildren,
  result: VNode[],
): void {
  for (const child of toChildArray(children)) {
    if (!isValidElement(child)) {
      continue;
    }

    if (MARKER_TYPES.has(child.type)) {
      result.push(child);
    } else {
      collectElements(
        (child.props as { readonly children: ComponentChildren }).children,
        result,
      );
    }
  }
}

function renderSlot(
  slotChildren: ComponentChildren,
  key: string,
  fallback?: ComponentChildren,
): VNode {
  const content =
    fallback === undefined ? (
      slotChildren
    ) : (
      <Suspense fallback={fallback}>{slotChildren}</Suspense>
    );

  return <Fragment key={key}>{content}</Fragment>;
}

function isFallbackKind(child: VNode): boolean {
  return child.type === NotFound || child.type === Self;
}

function assignFallbackSlot(child: VNode, slots: FallbackSlots): void {
  if (child.type === NotFound) {
    // First-wins: subsequent <NotFound> elements are ignored, symmetric with
    // <Self> below and the React adapter (#1220 / #1439). A boolean flag, not a
    // `notFoundChildren === null` sentinel: a first <NotFound>{null}</NotFound>
    // leaves the slot null, and a sentinel guard would let a later one overwrite.
    if (!slots.notFoundFound) {
      slots.notFoundChildren = (child.props as NotFoundProps).children;
      slots.notFoundFound = true;
    }

    return;
  }

  if (!slots.selfFound) {
    slots.selfChildren = (child.props as SelfProps).children;
    slots.selfFallback = (child.props as SelfProps).fallback;
    slots.selfFound = true;
  }
}

function processMatch(
  child: VNode,
  routeName: string,
  nodeName: string,
  alreadyActive: boolean,
): VNode | null {
  const {
    segment,
    exact = false,
    fallback,
    children,
  } = child.props as MatchProps;
  const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
  const isActive =
    !alreadyActive && isSegmentMatch(routeName, fullSegmentName, exact);

  if (!isActive) {
    return null;
  }

  return renderSlot(children, fullSegmentName, fallback);
}

function appendFallback(
  rendered: VNode[],
  routeName: string,
  nodeName: string,
  slots: FallbackSlots,
): void {
  if (slots.selfFound && routeName === nodeName) {
    rendered.push(
      renderSlot(slots.selfChildren, "__route-view-self__", slots.selfFallback),
    );

    return;
  }

  if (routeName === UNKNOWN_ROUTE && slots.notFoundChildren !== null) {
    rendered.push(
      <Fragment key="__route-view-not-found__">
        {slots.notFoundChildren}
      </Fragment>,
    );
  }
}

export function buildRenderList(
  elements: VNode[],
  routeName: string,
  nodeName: string,
): { rendered: VNode[]; activeMatchFound: boolean } {
  const slots: FallbackSlots = {
    selfChildren: null,
    selfFallback: undefined,
    selfFound: false,
    notFoundChildren: null,
    notFoundFound: false,
  };
  let activeMatchFound = false;
  const rendered: VNode[] = [];

  for (const child of elements) {
    if (isFallbackKind(child)) {
      assignFallbackSlot(child, slots);

      continue;
    }

    const matchRendered = processMatch(
      child,
      routeName,
      nodeName,
      activeMatchFound,
    );

    if (matchRendered !== null) {
      activeMatchFound = true;
      rendered.push(matchRendered);
    }
  }

  if (!activeMatchFound) {
    appendFallback(rendered, routeName, nodeName, slots);
  }

  return { rendered, activeMatchFound };
}
