import { children as resolveChildren, createMemo, For, Show } from "solid-js";

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

  // Idiomatic Solid: `<Show>` gates on the route presence, `<For>` iterates
  // the build-render-list output. `<Show when={...} keyed>` re-runs the
  // child callback only when route identity changes; `<For>` adds/removes
  // exactly the changed elements without re-running the rest.
  // (§8a Q4 audit fix — replaced an IIFE-in-JSX with idiomatic primitives.)
  const renderList = createMemo<JSX.Element[]>(() => {
    const state = routeState();

    if (!state.route) {
      return [];
    }

    return buildRenderList(elements(), state.route.name, props.nodeName);
  });

  return (
    <Show when={renderList().length > 0}>
      <For each={renderList()}>{(node) => node}</For>
    </Show>
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
