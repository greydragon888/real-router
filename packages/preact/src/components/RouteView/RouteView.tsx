import { Match, NotFound } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../hooks/useRouteNode";

import type { RouteViewProps } from "./types";
import type { VNode } from "preact";

function RouteViewRoot({
  nodeName,
  children,
}: Readonly<RouteViewProps>): VNode | null {
  const { route } = useRouteNode(nodeName);

  if (!route) {
    return null;
  }

  const elements: VNode[] = [];

  collectElements(children, elements);

  const { rendered } = buildRenderList(elements, route.name, nodeName);

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
