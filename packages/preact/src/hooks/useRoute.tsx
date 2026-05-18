import { createUseContextOrThrow, RouteContext } from "../context";

import type { RouteContext as RouteContextType } from "../types";
import type { Params, State } from "@real-router/core";

const useRouteContextOrThrow = createUseContextOrThrow(
  RouteContext,
  "useRoute",
);

export const useRoute = <P extends Params = Params>(): Omit<
  RouteContextType<P>,
  "route"
> & { route: State<P> } => {
  const routeContext = useRouteContextOrThrow();

  if (!routeContext.route) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return routeContext as Omit<RouteContextType<P>, "route"> & {
    route: State<P>;
  };
};
