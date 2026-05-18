import { useMemo, useRef } from "react";

import { Match, NotFound, Self } from "./components";
import { buildRenderList, collectElements } from "./helpers";
import { useRouteNode } from "../../../hooks/useRouteNode";

import type { RouteViewProps } from "./types";
import type { ReactElement } from "react";

function RouteViewRoot({
  nodeName,
  children,
}: Readonly<RouteViewProps>): ReactElement | null {
  const { route } = useRouteNode(nodeName);
  const hasBeenActivatedRef = useRef<Set<string> | null>(null);

  // eslint-disable-next-line @eslint-react/refs -- lazy init: assign once when null to avoid `new Set()` allocation on every render
  hasBeenActivatedRef.current ??= new Set();

  // Skip the Children.forEach + collectElements traversal when the children
  // reference is unchanged. The common SPA case is a stable JSX tree across
  // re-renders, so the cache hits on every render except the first.
  //
  // Streaming SSR caveat: with `renderToReadableStream`, React may invoke
  // RouteView multiple times across chunks with a fresh `children` reference
  // each time. The useMemo misses on each new render and the traversal runs
  // again — this is the expected SSR cost; the alternative would be build-
  // time codegen of the static route tree, which is out of scope here.
  const elements = useMemo(() => {
    const collected: ReactElement[] = [];

    collectElements(children, collected);

    return collected;
  }, [children]);

  if (!route) {
    return null;
  }

  const { rendered } = buildRenderList(
    elements,
    route.name,
    nodeName,
    // eslint-disable-next-line @eslint-react/refs -- stable Set ref read for keepAlive tracking (never reassigned)
    hasBeenActivatedRef.current,
  );

  if (rendered.length > 0) {
    return <>{rendered}</>;
  }

  return null;
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
