import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Fragment, isValidElement, toChildArray } from "preact";

import { Match, NotFound } from "./components";

import type { MatchProps, NotFoundProps } from "./types";
import type { VNode, ComponentChildren } from "preact";

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

export function collectElements(
  children: ComponentChildren,
  result: VNode[],
): void {
  for (const child of toChildArray(children)) {
    if (!isValidElement(child)) {
      continue;
    }

    if (child.type === Match || child.type === NotFound) {
      result.push(child);
    } else {
      collectElements(
        (child.props as { readonly children: ComponentChildren }).children,
        result,
      );
    }
  }
}

export function buildRenderList(
  elements: VNode[],
  routeName: string,
  nodeName: string,
): { rendered: VNode[]; activeMatchFound: boolean } {
  let notFoundChildren: ComponentChildren = null;
  let activeMatchFound = false;
  const rendered: VNode[] = [];

  for (const child of elements) {
    if (child.type === NotFound) {
      notFoundChildren = (child.props as NotFoundProps).children;
      continue;
    }

    const { segment, exact = false } = child.props as MatchProps;
    const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
    const isActive =
      !activeMatchFound && isSegmentMatch(routeName, fullSegmentName, exact);

    if (isActive) {
      activeMatchFound = true;
      rendered.push(
        <Fragment key={fullSegmentName}>
          {(child.props as MatchProps).children}
        </Fragment>,
      );
    }
  }

  if (
    !activeMatchFound &&
    routeName === UNKNOWN_ROUTE &&
    notFoundChildren !== null
  ) {
    rendered.push(
      <Fragment key="__route-view-not-found__">{notFoundChildren}</Fragment>,
    );
  }

  return { rendered, activeMatchFound };
}
