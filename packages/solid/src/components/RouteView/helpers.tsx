import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Suspense } from "solid-js";

import { MATCH_MARKER, NOT_FOUND_MARKER, SELF_MARKER } from "./components";

import type {
  MatchMarker,
  NotFoundMarker,
  RouteViewMarker,
  SelfMarker,
} from "./components";
import type { JSX } from "solid-js";

export function isSegmentMatch(
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

function isSelfMarker(value: unknown): value is SelfMarker {
  return (
    value != null &&
    typeof value === "object" &&
    "$$type" in value &&
    value.$$type === SELF_MARKER
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

  if (
    isMatchMarker(children) ||
    isSelfMarker(children) ||
    isNotFoundMarker(children)
  ) {
    result.push(children);
  }
}

// child.children is a getter — read it INSIDE the JSX expression so Solid
// creates a reactive dependency. Pulling it into a variable freezes the
// value at template-build time and breaks Suspense fallback transitions
// (lazy() resolution).
function renderMatch(child: MatchMarker): JSX.Element {
  return child.fallback === undefined ? (
    child.children
  ) : (
    <Suspense fallback={child.fallback}>{child.children}</Suspense>
  );
}

function renderSelf(self: SelfMarker): JSX.Element {
  return self.fallback === undefined ? (
    self.children
  ) : (
    <Suspense fallback={self.fallback}>{self.children}</Suspense>
  );
}

function processMatchChild(
  child: MatchMarker,
  routeName: string,
  nodeName: string,
): JSX.Element | null {
  const { segment, exact } = child;
  const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;

  if (!isSegmentMatch(routeName, fullSegmentName, exact)) {
    return null;
  }

  return renderMatch(child);
}

export function buildRenderList(
  elements: RouteViewMarker[],
  routeName: string,
  nodeName: string,
): JSX.Element[] {
  let selfMarker: SelfMarker | null = null;
  let notFoundChildren: JSX.Element | null = null;
  let activeMatchFound = false;
  const rendered: JSX.Element[] = [];

  for (const child of elements) {
    if (isNotFoundMarker(child)) {
      notFoundChildren = child.children;
      continue;
    }

    if (isSelfMarker(child)) {
      selfMarker ??= child;
      continue;
    }

    if (activeMatchFound) {
      continue;
    }

    const matchRendered = processMatchChild(child, routeName, nodeName);

    if (matchRendered !== null) {
      activeMatchFound = true;
      rendered.push(matchRendered);
    }
  }

  if (!activeMatchFound) {
    if (selfMarker !== null && routeName === nodeName) {
      rendered.push(renderSelf(selfMarker));
    } else if (routeName === UNKNOWN_ROUTE && notFoundChildren !== null) {
      rendered.push(notFoundChildren);
    }
  }

  return rendered;
}
