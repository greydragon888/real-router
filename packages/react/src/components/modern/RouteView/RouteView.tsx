import { useRef } from "react";

import { Match, NotFound } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../../hooks/useRouteNode";

import type { RouteViewProps } from "./types";
import type { ReactElement } from "react";

function RouteViewRoot({
  nodeName,
  children,
}: Readonly<RouteViewProps>): ReactElement | null {
  const { route } = useRouteNode(nodeName);
  const hasBeenActivatedRef = useRef<Set<string>>(new Set());

  if (!route) {
    return null;
  }

  const elements: ReactElement[] = [];

  collectElements(children, elements);

  const { rendered } = buildRenderList(
    elements,
    route.name,
    nodeName,
    hasBeenActivatedRef.current,
  );

  if (rendered.length > 0) {
    return <>{rendered}</>;
  }

  return null;
}

RouteViewRoot.displayName = "RouteView";

export const RouteView = Object.assign(RouteViewRoot, { Match, NotFound });

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
