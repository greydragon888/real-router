import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";

import { MATCH_MARKER, NOT_FOUND_MARKER } from "./components";

import type {
  MatchMarker,
  NotFoundMarker,
  RouteViewMarker,
} from "./components";
import type { JSX } from "solid-js";

function isSegmentMatch(
  routeName: string,
  fullSegmentName: string,
  exact: boolean,
): boolean {
  if (exact) {
    return routeName === fullSegmentName;
  }

  return startsWithSegment(routeName, fullSegmentName);
}

function isMatchMarker(value: unknown): value is MatchMarker {
  return (
    value != null &&
    typeof value === "object" &&
    "$$type" in value &&
    value.$$type === MATCH_MARKER
  );
}

function isNotFoundMarker(value: unknown): value is NotFoundMarker {
  return (
    value != null &&
    typeof value === "object" &&
    "$$type" in value &&
    value.$$type === NOT_FOUND_MARKER
  );
}

export function collectElements(
  children: unknown,
  result: RouteViewMarker[],
): void {
  if (children == null) {
    return;
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      collectElements(child, result);
    }

    return;
  }

  if (isMatchMarker(children) || isNotFoundMarker(children)) {
    result.push(children);
  }
}

export function buildRenderList(
  elements: RouteViewMarker[],
  routeName: string,
  nodeName: string,
): { rendered: JSX.Element[]; activeMatchFound: boolean } {
  let notFoundChildren: JSX.Element | null = null;
  let activeMatchFound = false;
  const rendered: JSX.Element[] = [];

  for (const child of elements) {
    if (isNotFoundMarker(child)) {
      notFoundChildren = child.children;
      continue;
    }

    const { segment, exact } = child;
    const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
    const isActive =
      !activeMatchFound && isSegmentMatch(routeName, fullSegmentName, exact);

    if (isActive) {
      activeMatchFound = true;
      rendered.push(child.children);
    }
  }

  if (
    !activeMatchFound &&
    routeName === UNKNOWN_ROUTE &&
    notFoundChildren !== null
  ) {
    rendered.push(notFoundChildren);
  }

  return { rendered, activeMatchFound };
}
