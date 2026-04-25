import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Activity, Children, Fragment, Suspense, isValidElement } from "react";

import { Match, NotFound, Self } from "./components";

import type { MatchProps, NotFoundProps, SelfProps } from "./types";
import type { ReactElement, ReactNode } from "react";

interface FallbackSlots {
  selfChildren: ReactNode;
  selfFallback: ReactNode | undefined;
  selfFound: boolean;
  notFoundChildren: ReactNode;
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
  children: ReactNode,
  result: ReactElement[],
): void {
  // eslint-disable-next-line @eslint-react/no-children-to-array
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) {
      continue;
    }

    if (
      child.type === Match ||
      child.type === Self ||
      child.type === NotFound
    ) {
      result.push(child);
    } else {
      collectElements(
        (child.props as { readonly children: ReactNode }).children,
        result,
      );
    }
  }
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
  hasBeenActivated: Set<string>,
  alreadyActive: boolean,
): { rendered: ReactElement | null; matched: boolean } {
  const {
    segment,
    exact = false,
    keepAlive = false,
    fallback,
  } = child.props as MatchProps;
  const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
  const isActive =
    !alreadyActive && isSegmentMatch(routeName, fullSegmentName, exact);

  if (isActive) {
    hasBeenActivated.add(fullSegmentName);

    return {
      rendered: renderSlotElement(
        (child.props as MatchProps).children,
        fullSegmentName,
        keepAlive,
        "visible",
        fallback,
      ),
      matched: true,
    };
  }

  if (keepAlive && hasBeenActivated.has(fullSegmentName)) {
    return {
      rendered: renderSlotElement(
        (child.props as MatchProps).children,
        fullSegmentName,
        keepAlive,
        "hidden",
        fallback,
      ),
      matched: false,
    };
  }

  return { rendered: null, matched: false };
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
        "__route-view-self__",
        false,
        "visible",
        slots.selfFallback,
      ),
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
  elements: ReactElement[],
  routeName: string,
  nodeName: string,
  hasBeenActivated: Set<string>,
): { rendered: ReactElement[]; activeMatchFound: boolean } {
  const slots: FallbackSlots = {
    selfChildren: null,
    selfFallback: undefined,
    selfFound: false,
    notFoundChildren: null,
  };
  let activeMatchFound = false;
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
      activeMatchFound,
    );

    if (result.matched) {
      activeMatchFound = true;
    }

    if (result.rendered !== null) {
      rendered.push(result.rendered);
    }
  }

  if (!activeMatchFound) {
    appendFallback(rendered, routeName, nodeName, slots);
  }

  return { rendered, activeMatchFound };
}
