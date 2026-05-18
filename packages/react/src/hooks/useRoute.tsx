import { useContext } from "react";

import { RouteContext } from "../context";

import type { RouteContext as RouteContextType } from "../types";
import type { Params, State } from "@real-router/core";

/**
 * Return shape of `useRoute<P>()` — the context with `route` narrowed to
 * `State<P>` (non-nullable). Promoting the intersection to a named alias
 * keeps the function signature and the cast site in sync.
 */
type RouteHookResult<P extends Params = Params> = Omit<
  RouteContextType<P>,
  "route"
> & { route: State<P> };

export const useRoute = <P extends Params = Params>(): RouteHookResult<P> => {
  const routeContext = useContext(RouteContext);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  if (!routeContext.route) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return routeContext as RouteHookResult<P>;
};
