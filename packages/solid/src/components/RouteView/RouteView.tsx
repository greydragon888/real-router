import { children as resolveChildren, createMemo } from "solid-js";

import { Match, NotFound, Self } from "./components";
import {
  collectElements,
  materializeWinner,
  pickWinner,
  winnersEqual,
} from "./helpers";
import { useRouteNode } from "../../hooks/useRouteNode";

import type { RouteViewMarker } from "./components";
import type { RouteViewWinner } from "./helpers";
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

  // FIX C (research #1094) — winner-keyed pipeline.
  // `winner` re-computes on every node-signal fire, but its custom equality
  // (kind + marker identity) stops propagation when the same marker stays
  // active. `rendered` therefore materializes marker.children exactly once
  // per winner CHANGE — the active subtree is preserved across in-winner
  // navigations (React/Vue adapter parity) instead of dispose+recreate.
  // This also replaces the previous <Show>+<For> pair (2 extra components +
  // mapArray machinery per RouteView) with a single memo returned as a
  // reactive JSX expression.
  const winner = createMemo<RouteViewWinner | null>(
    () => {
      const state = routeState();

      if (!state.route) {
        return null;
      }

      return pickWinner(elements(), state.route.name, props.nodeName);
    },
    null,
    { equals: winnersEqual },
  );

  const rendered = createMemo<JSX.Element>(() => {
    const current = winner();

    return current === null ? null : materializeWinner(current);
  });

  return rendered as unknown as JSX.Element;
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
