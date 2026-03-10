import { UNKNOWN_ROUTE } from "@real-router/core";
import { startsWithSegment } from "@real-router/route-utils";
import { Children, isValidElement } from "react";

import { useRouteNode } from "../hooks/useRouteNode";

import type { ReactElement, ReactNode } from "react";

interface RouteViewProps {
  /** Route tree node name to subscribe to. "" for root. */
  readonly nodeName: string;
  /** <RouteView.Match> and <RouteView.NotFound> elements. */
  readonly children: ReactNode;
}

interface MatchProps {
  /** Route segment to match against. */
  readonly segment: string;
  /** Exact match only (no descendants). Defaults to false. */
  readonly exact?: boolean;
  /** Content to render when matched. */
  readonly children: ReactNode;
}

interface NotFoundProps {
  /** Content to render on UNKNOWN_ROUTE. */
  readonly children: ReactNode;
}

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

function collectElements(children: ReactNode, result: ReactElement[]): void {
  // Children.toArray flattens arrays but does NOT unwrap Fragments,
  // so we recurse into Fragment children manually.
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

function findMatch(
  routeName: string,
  nodeName: string,
  children: ReactNode,
): { matched: ReactNode | null; notFoundChildren: ReactNode } {
  const elements: ReactElement[] = [];

  collectElements(children, elements);
  let notFoundChildren: ReactNode = null;

  for (const child of elements) {
    if (child.type === NotFound) {
      notFoundChildren = (child.props as NotFoundProps).children;
      continue;
    }

    const { segment, exact = false } = child.props as MatchProps;
    const fullSegmentName = nodeName ? `${nodeName}.${segment}` : segment;

    if (isSegmentMatch(routeName, fullSegmentName, exact)) {
      return {
        matched: (child.props as MatchProps).children,
        notFoundChildren,
      };
    }
  }

  return { matched: null, notFoundChildren };
}

function RouteViewRoot({
  nodeName,
  children,
}: RouteViewProps): ReactElement | null {
  const { route } = useRouteNode(nodeName);

  if (!route) {
    return null;
  }

  const { matched, notFoundChildren } = findMatch(
    route.name,
    nodeName,
    children,
  );

  if (matched !== null) {
    return <>{matched}</>;
  }

  if (route.name === UNKNOWN_ROUTE && notFoundChildren !== null) {
    return <>{notFoundChildren}</>;
  }

  return null;
}

RouteViewRoot.displayName = "RouteView";

function Match(_props: MatchProps): null {
  return null;
}

Match.displayName = "RouteView.Match";

function NotFound(_props: NotFoundProps): null {
  return null;
}

NotFound.displayName = "RouteView.NotFound";

export const RouteView = Object.assign(RouteViewRoot, { Match, NotFound });

export type { RouteViewProps };

export type { MatchProps as RouteViewMatchProps };

export type { NotFoundProps as RouteViewNotFoundProps };
