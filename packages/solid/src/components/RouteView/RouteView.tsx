import { children as resolveChildren } from "solid-js";

import { Match, NotFound } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../hooks/useRouteNode";

import type { RouteViewMarker } from "./components";
import type { RouteViewProps } from "./types";
import type { JSX } from "solid-js";

function RouteViewRoot(props: Readonly<RouteViewProps>): JSX.Element {
  const routeState = useRouteNode(props.nodeName);

  const resolved = resolveChildren(() => props.children);

  return (
    <>
      {(() => {
        const state = routeState();

        if (!state.route) {
          return null;
        }

        const elements: RouteViewMarker[] = [];

        collectElements(resolved(), elements);

        const { rendered } = buildRenderList(
          elements,
          state.route.name,
          props.nodeName,
        );

        if (rendered.length > 0) {
          return rendered;
        }

        return null;
      })()}
    </>
  ) as unknown as JSX.Element;
}

RouteViewRoot.displayName = "RouteView";

export const RouteView = Object.assign(RouteViewRoot, { Match, NotFound });

export type {
  RouteViewProps,
  MatchProps as RouteViewMatchProps,
  NotFoundProps as RouteViewNotFoundProps,
} from "./types";
