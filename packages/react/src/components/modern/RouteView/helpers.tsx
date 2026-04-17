import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Activity, Children, Fragment, Suspense, isValidElement } from "react";

import { Match, NotFound } from "./components";

import type { MatchProps, NotFoundProps } from "./types";
import type { ReactElement, ReactNode } from "react";

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

    if (child.type === Match || child.type === NotFound) {
      result.push(child);
    } else {
      collectElements(
        (child.props as { readonly children: ReactNode }).children,
        result,
      );
    }
  }
}

function renderMatchElement(
  matchChildren: ReactNode,
  fullSegmentName: string,
  keepAlive: boolean,
  mode: "visible" | "hidden",
  fallback?: ReactNode,
): ReactElement {
  const content =
    fallback === undefined ? (
      matchChildren
    ) : (
      <Suspense fallback={fallback}>{matchChildren}</Suspense>
    );

  if (keepAlive) {
    return (
      <Activity mode={mode} key={fullSegmentName}>
        {content}
      </Activity>
    );
  }

  return <Fragment key={fullSegmentName}>{content}</Fragment>;
}

export function buildRenderList(
  elements: ReactElement[],
  routeName: string,
  nodeName: string,
  hasBeenActivated: Set<string>,
): { rendered: ReactElement[]; activeMatchFound: boolean } {
  let notFoundChildren: ReactNode = null;
  let activeMatchFound = false;
  const rendered: ReactElement[] = [];

  for (const child of elements) {
    if (child.type === NotFound) {
      notFoundChildren = (child.props as NotFoundProps).children;
      continue;
    }

    const {
      segment,
      exact = false,
      keepAlive = false,
      fallback,
    } = child.props as MatchProps;
    const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;
    const isActive =
      !activeMatchFound && isSegmentMatch(routeName, fullSegmentName, exact);

    if (isActive) {
      activeMatchFound = true;
      hasBeenActivated.add(fullSegmentName);
      rendered.push(
        renderMatchElement(
          (child.props as MatchProps).children,
          fullSegmentName,
          keepAlive,
          "visible",
          fallback,
        ),
      );
    } else if (keepAlive && hasBeenActivated.has(fullSegmentName)) {
      rendered.push(
        renderMatchElement(
          (child.props as MatchProps).children,
          fullSegmentName,
          keepAlive,
          "hidden",
          fallback,
        ),
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
