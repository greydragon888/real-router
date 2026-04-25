import { children as resolveChildren, createMemo } from "solid-js";

import { Match, NotFound, Self } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../hooks/useRouteNode";

import type { RouteViewMarker } from "./components";
import type { RouteViewProps } from "./types";
import type { JSX } from "solid-js";

function RouteViewRoot(props: Readonly<RouteViewProps>): JSX.Element {
  const routeState = useRouteNode(props.nodeName);

  const resolved = resolveChildren(() => props.children);

  const elements = createMemo(() => {
    const arr: RouteViewMarker[] = [];

    collectElements(resolved(), arr);

    return arr;
  });

  return (
    <>
      {(() => {
        const state = routeState();

        if (!state.route) {
          return null;
        }

        const rendered = buildRenderList(
          elements(),
          state.route.name,
          props.nodeName,
        );

        return rendered.length > 0 ? rendered : null;
      })()}
    </>
  );
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
