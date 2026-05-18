import { useMemo } from "preact/hooks";

import { Match, NotFound, Self } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../hooks/useRouteNode";

import type { RouteViewProps } from "./types";
import type { VNode } from "preact";

function RouteViewRoot({
  nodeName,
  children,
}: Readonly<RouteViewProps>): VNode | null {
  const { route } = useRouteNode(nodeName);

  // Cache the flattened Match/Self/NotFound list across renders with unchanged
  // children. children only differs when the parent re-renders with a new
  // node, so this memoises the steady-state traversal.
  const elements = useMemo(() => {
    const collected: VNode[] = [];

    collectElements(children, collected);

    return collected;
  }, [children]);

  const routeName = route?.name;

  // buildRenderList is O(N) over Match/Self/NotFound children. Memo on
  // (elements, routeName, nodeName) skips the re-walk on parent re-renders
  // that don't change the active route; navigations always invalidate via
  // routeName.
  const rendered = useMemo(() => {
    if (routeName === undefined) {
      return [];
    }

    return buildRenderList(elements, routeName, nodeName).rendered;
  }, [elements, routeName, nodeName]);

  return rendered.length > 0 ? <>{rendered}</> : null;
}

RouteViewRoot.displayName = "RouteView";

export const RouteView = Object.assign(RouteViewRoot, {
  Match,
  Self,
  NotFound,
});

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  SelfProps as RouteViewSelfProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
